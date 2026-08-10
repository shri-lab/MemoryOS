"""
Files route handler.
Fills in Task 2.1 PDF upload, storage, and background extraction routing.
"""

import uuid
import logging
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File as FastAPIFile, BackgroundTasks, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.session import get_db_session, AsyncSessionLocal
from models import User, File as DBFile, Chunk, Tag, FileView
from auth.dependencies import get_current_user
from schemas.files import FileUploadResponse, FileListItem, FileDetail, SummarizeResponseSchema, RelatedFileSchema, RecentFileItemSchema
from constants import (
    SourceType, 
    FileStatus, 
    MAX_UPLOAD_MB, 
    ALLOWED_IMAGE_EXTENSIONS, 
    MAX_IMAGE_UPLOAD_MB, 
    MIN_OCR_TEXT_LEN_FOR_TAGGING,
    RELATED_FILES_TOP_K,
    RELATED_FILES_CANDIDATE_MULTIPLIER,
    RELATED_FILES_MIN_SCORE,
    RECENT_FILES_LIMIT
)
import services.pdf_service as pdf_service
import services.ocr_service as ocr_service
import services.embedding_service as embedding_service
from services.llm_service import LlmServiceError
import services.llm_service as llm_service
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
                if chunks:
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
                    logger.info(f"File ID {file_id} processing successfully completed and status updated to READY")
                else:
                    db_file.status = FileStatus.FAILED
                    logger.warning(f"File ID {file_id} processing failed (no chunks generated); status updated to FAILED")
                
                await session.commit()
        except Exception as e:
            logger.error(f"Background processing pipeline failed for file ID {file_id}: {e}")
            result = await session.execute(select(DBFile).where(DBFile.id == file_id))
            db_file = result.scalar_one_or_none()
            if db_file:
                db_file.status = FileStatus.FAILED
                await session.commit()
                logger.info(f"File ID {file_id} status updated to FAILED")


async def process_image_extraction(file_id: uuid.UUID, file_bytes: bytes) -> None:
    """
    Background task to extract text from an image via OCR, split it into chunks,
    generate embeddings, save chunk rows (with page_number=None), run summarization
    and topic tag extraction using Gemini, and update file status.
    """
    async with AsyncSessionLocal() as session:
        try:
            logger.info(f"Starting background image OCR extraction, chunking, and embedding for file ID: {file_id}")
            
            # 1. Run OCR (CPU/IO bound)
            extracted_text = await asyncio.to_thread(ocr_service.extract_text_from_image, file_bytes)
            logger.info(f"Extracted OCR text length: {len(extracted_text)} from file ID: {file_id}")
            
            # 2. Split text into chunks (reusing shared chunk_text helper)
            pages_data = [{"page_number": None, "text": extracted_text}]
            chunks = pdf_service.chunk_text(pages_data)
            logger.info(f"Generated {len(chunks)} chunks from file ID: {file_id}")
            
            # 3. Generate embeddings
            if chunks:
                chunk_contents = [c["content"] for c in chunks]
                embeddings = await asyncio.to_thread(embedding_service.generate_embeddings_batch, chunk_contents)
                logger.info(f"Generated {len(embeddings)} embeddings for file ID: {file_id}")
                
                # 4. Save Chunk DB rows
                db_chunks = []
                for i, chunk in enumerate(chunks):
                    db_chunk = Chunk(
                        file_id=file_id,
                        content=chunk["content"],
                        page_number=None,  # Explicitly None for images
                        embedding=embeddings[i]
                    )
                    db_chunks.append(db_chunk)
                session.add_all(db_chunks)
            else:
                logger.warning(f"No text extracted from image OCR for file ID {file_id}; no chunks saved.")
                
            # 5. Get file and update summary/topics via Gemini
            result = await session.execute(
                select(DBFile)
                .options(selectinload(DBFile.tags))
                .where(DBFile.id == file_id)
            )
            db_file = result.scalar_one_or_none()
            if db_file:
                if chunks:
                    cleaned_text = extracted_text.strip()
                    if len(cleaned_text) >= MIN_OCR_TEXT_LEN_FOR_TAGGING:
                        logger.info(f"OCR text length ({len(cleaned_text)}) meets threshold ({MIN_OCR_TEXT_LEN_FOR_TAGGING}). Triggering summarization and tag generation.")
                        
                        # Summarize document
                        try:
                            summary = await llm_service.summarize_document(cleaned_text)
                            db_file.summary = summary
                            logger.info(f"Background image summarization succeeded for file ID: {file_id}")
                        except Exception as summarize_err:
                            logger.error(f"Background image summarization failed for file {file_id}: {summarize_err}", exc_info=True)
                        
                        # Extract topics
                        try:
                            topics = await llm_service.extract_topics(cleaned_text)
                            logger.info(f"Background image topic extraction returned {len(topics)} topics for file ID: {file_id}")
                            await associate_topics_with_file(session, db_file, topics)
                        except Exception as topics_err:
                            logger.error(f"Background image topic extraction failed for file {file_id}: {topics_err}", exc_info=True)
                    else:
                        logger.info(f"OCR text length ({len(cleaned_text)}) is below threshold ({MIN_OCR_TEXT_LEN_FOR_TAGGING}). Skipping summarization and tag generation.")
                    
                    db_file.status = FileStatus.READY
                    logger.info(f"File ID {file_id} image processing successfully completed and status updated to READY")
                else:
                    db_file.status = FileStatus.FAILED
                    logger.warning(f"File ID {file_id} image processing failed (no chunks extracted); status updated to FAILED")
                
                await session.commit()
        except Exception as e:
            logger.error(f"Background image processing pipeline failed for file ID {file_id}: {e}")
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
    Protected PDF/Image upload endpoint. Creates DB entry, uploads raw file to Supabase Storage,
    and registers a background task for text extraction/OCR.
    """
    # 1. Validate file extension (must be PDF or allowed image)
    filename = file.filename or "uploaded_file.pdf"
    lower_name = filename.lower()
    is_pdf = lower_name.endswith(".pdf")
    is_image = any(lower_name.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS)

    if not (is_pdf or is_image):
        allowed_formats_str = ", ".join(sorted(list(ALLOWED_IMAGE_EXTENSIONS)))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed formats: PDF or images ({allowed_formats_str})."
        )

    # 2. Read content and validate file size depending on type
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    limit_mb = MAX_UPLOAD_MB if is_pdf else MAX_IMAGE_UPLOAD_MB
    
    if file_size_mb > limit_mb:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the maximum limit of {limit_mb}MB."
        )

    # Determine source_type and content_type
    source_type = SourceType.PDF if is_pdf else SourceType.SCREENSHOT
    if is_pdf:
        content_type = "application/pdf"
    else:
        content_type = "image/png"
        if lower_name.endswith(".jpg") or lower_name.endswith(".jpeg"):
            content_type = "image/jpeg"
        elif lower_name.endswith(".webp"):
            content_type = "image/webp"
        elif lower_name.endswith(".bmp"):
            content_type = "image/bmp"

    # 3. Create database record in UPLOADING status
    db_file = DBFile(
        user_id=current_user.id,
        source_type=source_type,
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
            str(current_user.id),
            content_type
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
    if is_pdf:
        background_tasks.add_task(process_pdf_extraction, db_file.id, content)
    else:
        background_tasks.add_task(process_image_extraction, db_file.id, content)

    return FileUploadResponse.model_validate(db_file)


@router.get("", response_model=List[FileListItem])
async def list_files(
    source_type: Optional[SourceType] = Query(None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> List[FileListItem]:
    """
    Lists all files uploaded by the currently authenticated user,
    ordered by creation date descending. Optionally filters by source_type (pdf, screenshot).
    """
    stmt = select(DBFile).where(DBFile.user_id == current_user.id)
    if source_type:
        stmt = stmt.where(DBFile.source_type == source_type)
    stmt = stmt.order_by(DBFile.created_at.desc())
    
    result = await db.execute(stmt)
    files = result.scalars().all()
    return [FileListItem.model_validate(f) for f in files]


@router.get("/recent", response_model=List[RecentFileItemSchema])
async def get_recent_files(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> List[RecentFileItemSchema]:
    """
    Retrieves the current user's most recently viewed files (ordered by viewed_at DESC).
    Excludes files whose status is no longer READY. Capped at RECENT_FILES_LIMIT.
    """
    stmt = (
        select(DBFile, FileView.viewed_at)
        .join(FileView, DBFile.id == FileView.file_id)
        .where(
            FileView.user_id == current_user.id,
            DBFile.user_id == current_user.id,
            DBFile.status == FileStatus.READY
        )
        .order_by(FileView.viewed_at.desc())
        .limit(RECENT_FILES_LIMIT)
    )

    result = await db.execute(stmt)
    rows = result.all()

    recent_items = []
    for db_file, viewed_at in rows:
        recent_items.append(RecentFileItemSchema(
            id=db_file.id,
            filename=db_file.filename,
            source_type=db_file.source_type,
            status=db_file.status,
            viewed_at=viewed_at
        ))

    return recent_items


@router.post("/{file_id}/view")
async def record_file_view(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Records or updates a 'last viewed' timestamp for the specified file.
    Verifies ownership and READY status, returning 404 otherwise.
    Uses PostgreSQL ON CONFLICT DO UPDATE to avoid duplicate rows per file.
    """
    result = await db.execute(
        select(DBFile).where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()

    if not db_file or db_file.status != FileStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied."
        )

    # Upsert FileView record on conflict (user_id, file_id)
    stmt = pg_insert(FileView).values(
        user_id=current_user.id,
        file_id=file_id,
        viewed_at=func.now()
    ).on_conflict_do_update(
        constraint="uq_file_view_user_file",
        set_={"viewed_at": func.now()}
    )

    await db.execute(stmt)
    await db.commit()

    return {"detail": "File view recorded successfully."}


@router.get("/{file_id}", response_model=FileDetail)
async def get_file_detail(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> FileDetail:
    """
    Retrieves detailed metadata for a specific file owned by the current user,
    including tags and concatenated text chunks.
    Raises 404 if not found or not owned.
    """
    result = await db.execute(
        select(DBFile)
        .options(selectinload(DBFile.tags), selectinload(DBFile.chunks))
        .where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()
    
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied."
        )
        
    tags_list = [t.name for t in db_file.tags]
    chunks_text = "\n\n".join([c.content for c in db_file.chunks]) if db_file.chunks else None
    
    return FileDetail(
        id=db_file.id,
        filename=db_file.filename,
        source_type=db_file.source_type,
        status=db_file.status,
        summary=db_file.summary,
        tags=tags_list,
        extracted_text=chunks_text,
        created_at=db_file.created_at
    )


@router.get("/{file_id}/content")
async def get_file_content(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> Response:
    """
    Streams raw file content (image or PDF bytes) from Supabase Storage.
    Strictly verifies ownership and returns HTTP 404 if not found or not owned by current user.
    """
    result = await db.execute(
        select(DBFile).where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()
    
    if not db_file or not db_file.storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied."
        )

    try:
        content_bytes = await asyncio.to_thread(
            pdf_service.download_from_storage, db_file.storage_path
        )
    except Exception as e:
        logger.error(f"Failed to download file {file_id} content: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File content unavailable."
        )

    filename_lower = db_file.filename.lower()
    media_type = "application/octet-stream"
    if filename_lower.endswith(".png"):
        media_type = "image/png"
    elif filename_lower.endswith((".jpg", ".jpeg")):
        media_type = "image/jpeg"
    elif filename_lower.endswith(".webp"):
        media_type = "image/webp"
    elif filename_lower.endswith(".bmp"):
        media_type = "image/bmp"
    elif filename_lower.endswith(".pdf"):
        media_type = "application/pdf"

    return Response(content=content_bytes, media_type=media_type)


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
        logger.info(f"No chunks found for file {file_id} during manual summary. Attempting dynamic re-extraction.")
        try:
            content = await asyncio.to_thread(pdf_service.download_from_storage, db_file.storage_path)
            if db_file.source_type == SourceType.PDF:
                pages = await asyncio.to_thread(pdf_service.extract_text_from_pdf, content)
                chunks_data = pdf_service.chunk_text(pages)
            else:
                extracted_text = await asyncio.to_thread(ocr_service.extract_text_from_image, content)
                pages_data = [{"page_number": None, "text": extracted_text}]
                chunks_data = pdf_service.chunk_text(pages_data)
            
            if chunks_data:
                chunk_contents = [c["content"] for c in chunks_data]
                embeddings = await asyncio.to_thread(embedding_service.generate_embeddings_batch, chunk_contents)
                
                db_chunks = []
                for i, chunk in enumerate(chunks_data):
                    db_chunk = Chunk(
                        file_id=file_id,
                        content=chunk["content"],
                        page_number=chunk["page_number"] if db_file.source_type == SourceType.PDF else None,
                        embedding=embeddings[i]
                    )
                    db_chunks.append(db_chunk)
                db.add_all(db_chunks)
                await db.flush()
                
                chunks = db_chunks
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No text chunks found for this file after re-extraction. Summarization cannot run."
                )
        except HTTPException:
            raise
        except Exception as extract_err:
            logger.error(f"Dynamic re-extraction failed for file {file_id}: {extract_err}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No text chunks found, and re-extraction failed: {extract_err}"
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


def truncate_snippet_word_boundary(content: str, max_chars: int = 200) -> str:
    """
    Truncates a text snippet to approximately max_chars on a word boundary.
    """
    cleaned = content.strip()
    if len(cleaned) <= max_chars:
        return cleaned

    truncated = cleaned[:max_chars]
    last_space = truncated.rfind(' ')
    if last_space > 100:
        return truncated[:last_space] + "..."
    return truncated + "..."


@router.get("/{file_id}/related", response_model=List[RelatedFileSchema])
async def get_related_files(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> List[RelatedFileSchema]:
    """
    Retrieves semantically related files owned by the current authenticated user.
    Uses mean-pooled chunk embeddings of the target file to search other ready files.
    Raises 404 Not Found if file is missing, unowned, or status != READY.
    """
    # 1. Ownership & status check: Must strictly return 404 in all non-ready/unowned/missing cases
    result = await db.execute(
        select(DBFile).where(DBFile.id == file_id, DBFile.user_id == current_user.id)
    )
    db_file = result.scalar_one_or_none()

    if not db_file or db_file.status != FileStatus.READY:
        logger.warning(f"Related files lookup rejected: file {file_id} not found, unowned, or not READY for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied."
        )

    # 2. Fetch target file chunks
    chunks = await vector_search_service.get_chunks_by_file(db, file_id)
    if not chunks:
        logger.info(f"Target file {file_id} has zero chunks. Returning empty related list.")
        return []

    # Extract chunk embeddings
    embeddings = [c.embedding for c in chunks if c.embedding is not None]
    if not embeddings:
        logger.info(f"Target file {file_id} has no embeddings. Returning empty related list.")
        return []

    # 3. Mean-pool chunk embeddings
    target_vector = embedding_service.mean_pool_embeddings(embeddings)

    # 4. Search raw candidate chunks across user's other ready files
    candidate_limit = RELATED_FILES_TOP_K * RELATED_FILES_CANDIDATE_MULTIPLIER
    raw_candidates = await vector_search_service.find_related_file_chunks(
        db=db,
        user_id=current_user.id,
        source_file_id=file_id,
        target_vector=target_vector,
        candidate_limit=candidate_limit,
        min_score=RELATED_FILES_MIN_SCORE
    )

    if not raw_candidates:
        return []

    # 5. Deduplicate by file_id (best-scoring chunk per file wins)
    unique_related_map = {}
    for c in raw_candidates:
        fid = str(c["file_id"])
        if fid not in unique_related_map or c["similarity_score"] > unique_related_map[fid]["similarity_score"]:
            unique_related_map[fid] = c

    # Sort deduplicated files descending by similarity_score
    sorted_related = sorted(unique_related_map.values(), key=lambda x: x["similarity_score"], reverse=True)

    # 6. Format response items capped at RELATED_FILES_TOP_K
    response_items = []
    for rel in sorted_related[:RELATED_FILES_TOP_K]:
        response_items.append(RelatedFileSchema(
            file_id=rel["file_id"],
            filename=rel["filename"],
            source_type=rel["source_type"],
            similarity_score=rel["similarity_score"],
            matched_snippet=truncate_snippet_word_boundary(rel["content"])
        ))

    return response_items
