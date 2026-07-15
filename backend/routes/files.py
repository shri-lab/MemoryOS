"""
Files route handler.
Fills in Task 2.1 PDF upload, storage, and background extraction routing.
"""

import uuid
import logging
import asyncio
from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File as FastAPIFile, BackgroundTasks
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.session import get_db_session, AsyncSessionLocal
from models import User, File as DBFile, Chunk, Tag
from auth.dependencies import get_current_user
from schemas.files import FileUploadResponse, FileListItem, FileDetail, SummarizeResponseSchema
from constants import SourceType, FileStatus, MAX_UPLOAD_MB
import services.pdf_service as pdf_service
import services.embedding_service as embedding_service
import services.llm_service as llm_service
from services.llm_service import LlmServiceError
import services.vector_search_service as vector_search_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])


async def associate_topics_with_file(session: AsyncSession, db_file: DBFile, topics: List[str]) -> None:
    """
    Associates topic tags with a File.
    Matches tags case-insensitively to avoid duplicates, creating them if needed.
    """
    db_file.tags.clear()
    for topic_name in topics:
        topic_name = topic_name.strip()
        if not topic_name:
            continue
        
        # Check case-insensitive match in database
        stmt = select(Tag).where(func.lower(Tag.name) == func.lower(topic_name))
        res = await session.execute(stmt)
        existing_tag = res.scalar_one_or_none()
        
        if existing_tag:
            if existing_tag not in db_file.tags:
                db_file.tags.append(existing_tag)
        else:
            new_tag = Tag(name=topic_name)
            session.add(new_tag)
            db_file.tags.append(new_tag)


async def process_pdf_extraction(file_id: uuid.UUID, file_bytes: bytes) -> None:
    """
    Background task to extract text, split it into overlapping chunks, generate 
    embeddings using sentence-transformers, save chunks to the DB, run summarization 
    and topic tag extraction using Gemini, and update file status.
    Uses AsyncSessionLocal to obtain a new database session context.
    """
    async with AsyncSessionLocal() as session:
        try:
            logger.info(f"Starting background PDF text extraction, chunking, and embedding for file ID: {file_id}")
            
            # 1. Extract page-by-page text (CPU-bound)
            pages = await asyncio.to_thread(pdf_service.extract_text_from_pdf, file_bytes)
            logger.info(f"Extracted {len(pages)} pages from file ID: {file_id}")
            
            # 2. Split text into chunks
            chunks = pdf_service.chunk_text(pages)
            logger.info(f"Generated {len(chunks)} chunks from file ID: {file_id}")
            
            # 3. Generate embeddings for all chunk contents in batch if chunks exist
            if chunks:
                chunk_contents = [c["content"] for c in chunks]
                embeddings = await asyncio.to_thread(embedding_service.generate_embeddings_batch, chunk_contents)
                logger.info(f"Generated {len(embeddings)} embeddings for file ID: {file_id}")
                
                # 4. Save Chunk DB rows to database
                db_chunks = []
                for i, chunk in enumerate(chunks):
                    db_chunk = Chunk(
                        file_id=file_id,
                        content=chunk["content"],
                        page_number=chunk["page_number"],
                        embedding=embeddings[i]
                    )
                    db_chunks.append(db_chunk)
                
                session.add_all(db_chunks)
            else:
                logger.warning(f"No text extracted from PDF for file ID {file_id}; no chunks will be saved.")
            
            # 5. Get file and update summary/topics via Gemini
            result = await session.execute(
                select(DBFile)
                .options(selectinload(DBFile.tags))
                .where(DBFile.id == file_id)
            )
            db_file = result.scalar_one_or_none()
            if db_file:
                # Concatenate all page texts
                full_text = "\n".join([page["text"] for page in pages if page["text"]]).strip()
                if full_text:
                    # Summarize document
                    try:
                        summary = await llm_service.summarize_document(full_text)
                        db_file.summary = summary
                        logger.info(f"Background summarization succeeded for file ID: {file_id}")
                    except LlmServiceError as summarize_err:
                        logger.warning(f"Background summarization failed for file {file_id}: {summarize_err}")
                    
                    # Extract topics
                    try:
                        topics = await llm_service.extract_topics(full_text)
                        logger.info(f"Background topic extraction returned {len(topics)} topics for file ID: {file_id}")
                        await associate_topics_with_file(session, db_file, topics)
                    except LlmServiceError as topics_err:
                        logger.warning(f"Background topic extraction failed for file {file_id}: {topics_err}")
                
                db_file.status = FileStatus.READY
                await session.commit()
                logger.info(f"File ID {file_id} processing successfully completed and status updated to READY")
        except Exception as e:
            logger.error(f"Background processing pipeline failed for file ID {file_id}: {e}")
            result = await session.execute(select(DBFile).where(DBFile.id == file_id))
            db_file = result.scalar_one_or_none()
            if db_file:
                db_file.status = FileStatus.FAILED
                await session.commit()
                logger.info(f"File ID {file_id} status updated to FAILED")


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = FastAPIFile(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> FileUploadResponse:
    """
    Protected PDF upload endpoint. Creates DB entry, uploads raw PDF to Supabase Storage,
    and registers a background task for page-by-page text extraction.
    """
    # 1. Validate file extension (must be PDF)
    filename = file.filename or "uploaded_file.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only PDF uploads are allowed."
        )

    # 2. Read content and validate file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_UPLOAD_MB:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the maximum limit of {MAX_UPLOAD_MB}MB."
        )

    # 3. Create database record in UPLOADING status
    db_file = DBFile(
        user_id=current_user.id,
        source_type=SourceType.PDF,
        filename=filename,
        storage_path="",  # Filled in after successful upload
        status=FileStatus.UPLOADING
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    try:
        # 4. Upload file to Supabase Storage
        storage_path = await asyncio.to_thread(
            pdf_service.upload_to_storage,
            content,
            filename,
            str(current_user.id)
        )
        
        # 5. Update DB record status to PROCESSING and save path
        db_file.storage_path = storage_path
        db_file.status = FileStatus.PROCESSING
        await db.commit()
        await db.refresh(db_file)
    except Exception as upload_err:
        logger.error(f"Failed to upload file to storage bucket: {upload_err}")
        db_file.status = FileStatus.FAILED
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist file in storage."
        )

    # 6. Kick off background text extraction task
    background_tasks.add_task(process_pdf_extraction, db_file.id, content)

    return FileUploadResponse.model_validate(db_file)


@router.get("", response_model=List[FileListItem])
async def list_files(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> List[FileListItem]:
    """
    Lists all files uploaded by the currently authenticated user,
    ordered by creation date descending.
    """
    result = await db.execute(
        select(DBFile)
        .where(DBFile.user_id == current_user.id)
        .order_by(DBFile.created_at.desc())
    )
    files = result.scalars().all()
    return [FileListItem.model_validate(f) for f in files]


@router.get("/{file_id}", response_model=FileDetail)
async def get_file_detail(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> FileDetail:
    """
    Retrieves detailed metadata for a specific file owned by the current user.
    Raises 404 if not found or not owned.
    """
    result = await db.execute(
        select(DBFile)
        .where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()
    
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied."
        )
        
    return FileDetail.model_validate(db_file)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> None:
    """
    Deletes the file metadata from the database (cascades to chunks)
    and removes the file object from private Supabase Storage.
    Raises 404 if not found or not owned.
    """
    result = await db.execute(
        select(DBFile)
        .where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()
    
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied."
        )

    storage_path = db_file.storage_path

    # Delete row from DB first to free DB references
    await db.delete(db_file)
    await db.commit()

    # Clean up corresponding object in Supabase Storage
    if storage_path:
        try:
            await asyncio.to_thread(pdf_service.delete_from_storage, storage_path)
        except Exception as storage_err:
            logger.error(
                f"Failed to delete file {storage_path} from storage bucket: {storage_err}"
            )
            # Log warning but do not return a 500 error since the DB cleanup succeeded


@router.post("/{file_id}/summarize", response_model=SummarizeResponseSchema)
async def summarize_file_manually(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> SummarizeResponseSchema:
    """
    Manually triggers document summarization and topic extraction for a specific file.
    Validates user ownership and returns the updated summary and topic tags list.
    """
    # 1. Fetch file and verify user ownership (raise 404 to avoid leaking existence of files)
    result = await db.execute(
        select(DBFile)
        .options(selectinload(DBFile.tags))
        .where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )

    # 2. Fetch chunks and reconstruct text
    chunks = await vector_search_service.get_chunks_by_file(db, file_id)
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No text chunks found for this file. Summarization cannot run."
        )

    full_text = "\n".join([c.content for c in chunks if c.content]).strip()
    if not full_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reconstructed text content is empty."
        )

    # 3. Re-run summarization and topic extraction
    try:
        summary = await llm_service.summarize_document(full_text)
        topics = await llm_service.extract_topics(full_text)
    except LlmServiceError as llm_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM processing failed: {llm_err}"
        )

    # 4. Save and commit database updates
    db_file.summary = summary
    await associate_topics_with_file(db, db_file, topics)
    await db.commit()

    return SummarizeResponseSchema(
        summary=db_file.summary,
        topics=[tag.name for tag in db_file.tags]
    )
