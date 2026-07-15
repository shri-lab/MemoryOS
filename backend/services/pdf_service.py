"""
PDF Service for handling Supabase Storage uploads/deletions and PDF text extraction.
Fills in Task 2.1 PDF storage and extraction logic.
"""

import io
import uuid
import logging
import pdfplumber
from supabase import create_client, Client
from config import get_settings
from constants import CHUNK_SIZE, CHUNK_OVERLAP

logger = logging.getLogger(__name__)

# Load settings and initialize Supabase client
settings = get_settings()
supabase_client: Client = create_client(
    settings.SUPABASE_STORAGE_URL, 
    settings.SUPABASE_STORAGE_KEY
)

BUCKET_NAME = "memoryos-files"


def upload_to_storage(file_bytes: bytes, filename: str, user_id: str) -> str:
    """
    Uploads file bytes to the private Supabase Storage bucket 'memoryos-files'.
    
    Args:
        file_bytes: The raw file data in bytes.
        filename: The original name of the uploaded file.
        user_id: The UUID of the user who owns the file.
        
    Returns:
        The storage path within the bucket (e.g. 'user_id/uuid_filename.pdf').
        
    Raises:
        Exception: If the Supabase client returns an error during upload.
    """
    unique_id = uuid.uuid4()
    storage_path = f"{user_id}/{unique_id}_{filename}"
    
    try:
        response = supabase_client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content_type": "application/pdf",
                "upsert": "false"
            }
        )
        logger.info(f"Successfully uploaded {filename} to path {storage_path}")
        return storage_path
    except Exception as e:
        logger.error(f"Failed to upload {filename} to Supabase Storage: {e}")
        raise e


def delete_from_storage(storage_path: str) -> None:
    """
    Deletes a file from Supabase Storage by its storage path.
    
    Args:
        storage_path: The path of the file in the bucket.
        
    Raises:
        Exception: If the Supabase client returns an error during deletion.
    """
    try:
        supabase_client.storage.from_(BUCKET_NAME).remove([storage_path])
        logger.info(f"Successfully deleted storage file at path: {storage_path}")
    except Exception as e:
        logger.error(f"Failed to delete {storage_path} from Supabase Storage: {e}")
        raise e


def extract_text_from_pdf(file_bytes: bytes) -> list[dict]:
    """
    Extracts text page by page from PDF file bytes using pdfplumber.
    If a page has no extractable text (e.g., scanned images), it logs a warning 
    and appends an entry with an empty string rather than failing.
    
    Args:
        file_bytes: Raw bytes of the PDF.
        
    Returns:
        A list of dictionaries representing pages: [{"page_number": 1, "text": "..."}, ...]
    """
    pages_data = []
    
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for index, page in enumerate(pdf.pages):
                page_number = index + 1
                try:
                    text = page.extract_text()
                    if not text or not text.strip():
                        logger.warning(f"No extractable text found on page {page_number}")
                        pages_data.append({"page_number": page_number, "text": ""})
                    else:
                        pages_data.append({"page_number": page_number, "text": text})
                except Exception as page_err:
                    logger.warning(f"Failed to extract text on page {page_number}: {page_err}")
                    pages_data.append({"page_number": page_number, "text": ""})
    except Exception as pdf_err:
        logger.error(f"pdfplumber failed to open or parse the PDF bytes: {pdf_err}")
        raise pdf_err
        
    return pages_data


def chunk_text(page_texts: list[dict]) -> list[dict]:
    """
    Splits extracted PDF text into smaller overlapping chunks.
    Respects page boundaries and does not span chunks across pages.
    If a page's text is shorter than CHUNK_SIZE, it results in a single chunk.
    
    Args:
        page_texts: List of dicts representing page texts: [{"page_number": 1, "text": "..."}, ...]
        
    Returns:
        List of dicts representing chunks: [{"content": "...", "page_number": 1}, ...]
    """
    chunks = []
    
    for page in page_texts:
        page_number = page["page_number"]
        text = page["text"]
        if not text or not text.strip():
            continue
            
        text_len = len(text)
        
        # If the page text is shorter than the target chunk size, keep it as one chunk
        if text_len <= CHUNK_SIZE:
            chunks.append({
                "content": text.strip(),
                "page_number": page_number
            })
            continue
            
        start = 0
        while start < text_len:
            end = start + CHUNK_SIZE
            chunk_content = text[start:end].strip()
            
            if chunk_content:
                chunks.append({
                    "content": chunk_content,
                    "page_number": page_number
                })
                
            # If we reached the end of the page, stop
            if end >= text_len:
                break
                
            start += (CHUNK_SIZE - CHUNK_OVERLAP)
            
    return chunks
