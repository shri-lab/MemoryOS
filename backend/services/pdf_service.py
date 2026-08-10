"""
PDF Service for handling Supabase Storage uploads/deletions and PDF text extraction.
Fills in Task 2.1 PDF storage and extraction logic.
"""

import io
import uuid
import logging
import re
import pdfplumber
from supabase import create_client, Client
from config import get_settings
from constants import CHUNK_SIZE, CHUNK_OVERLAP, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE

logger = logging.getLogger(__name__)

# Load settings and initialize Supabase client
settings = get_settings()
supabase_client: Client = create_client(
    settings.SUPABASE_STORAGE_URL, 
    settings.SUPABASE_STORAGE_KEY
)

BUCKET_NAME = "memoryos-files"


def upload_to_storage(file_bytes: bytes, filename: str, user_id: str, content_type: str = "application/pdf") -> str:
    """
    Uploads file bytes to the private Supabase Storage bucket 'memoryos-files'.
    
    Args:
        file_bytes: The raw file data in bytes.
        filename: The original name of the uploaded file.
        user_id: The UUID of the user who owns the file.
        content_type: The MIME content type of the file.
        
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
                "content_type": content_type,
                "upsert": "false"
            }
        )
        logger.info(f"Successfully uploaded {filename} to path {storage_path} with content_type {content_type}")
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


def download_from_storage(storage_path: str) -> bytes:
    """
    Downloads raw file bytes from Supabase Storage by its storage path.
    """
    try:
        data = supabase_client.storage.from_(BUCKET_NAME).download(storage_path)
        logger.info(f"Successfully downloaded file from path: {storage_path}")
        return data
    except Exception as e:
        logger.error(f"Failed to download {storage_path} from Supabase Storage: {e}")
        raise e


def extract_text_from_pdf(file_bytes: bytes) -> list[dict]:
    """
    Extracts text page by page from PDF file bytes using pdfplumber.
    If a page has no extractable text (e.g., scanned images), it attempts to
    perform OCR on the page. If that also fails, it appends an entry with an
    empty string.
    
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
                        logger.warning(f"No extractable text found on page {page_number}. Attempting OCR fallback.")
                        try:
                            # Lazy imports to avoid circular dependency
                            import services.ocr_service as ocr_svc
                            import pytesseract
                            
                            # Render page to PIL image
                            img = page.to_image(resolution=150).original
                            processed_img = ocr_svc.preprocess_image(img)
                            ocr_text = pytesseract.image_to_string(processed_img)
                            if ocr_text and ocr_text.strip():
                                text = ocr_text
                                logger.info(f"Successfully extracted text via OCR on page {page_number} (length: {len(text)})")
                            else:
                                text = ""
                        except Exception as ocr_err:
                            logger.error(f"OCR fallback failed on page {page_number}: {ocr_err}")
                            text = ""
                    
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
    Splits text in priority order:
    1. Paragraph boundaries (\n\n)
    2. Sentence boundaries (.!? followed by whitespace)
    3. Hard character cuts (only if a single sentence/paragraph exceeds MAX_CHUNK_SIZE)
    
    Each chunk after the first starts CHUNK_OVERLAP characters before the end of the previous chunk,
    aligned to semantic paragraph/sentence boundaries where possible.
    
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
            
        text = text.strip()
        text_len = len(text)
        
        # If the page text is shorter than the target chunk size, keep it as one chunk
        if text_len <= CHUNK_SIZE:
            chunks.append({
                "content": text,
                "page_number": page_number
            })
            continue
            
        # Find all paragraph and sentence boundary indices in the text
        paragraph_boundaries = [0]
        for m in re.finditer(r'\n\n', text):
            paragraph_boundaries.append(m.end())
        paragraph_boundaries.append(text_len)
        paragraph_boundaries = sorted(list(set(paragraph_boundaries)))
        
        sentence_boundaries = [0]
        for m in re.finditer(r'(?<=[.!?])\s+', text):
            sentence_boundaries.append(m.end())
        sentence_boundaries.append(text_len)
        sentence_boundaries = sorted(list(set(sentence_boundaries)))

        start = 0
        while start < text_len:
            # If the remaining text fits in CHUNK_SIZE, finish it
            if start + CHUNK_SIZE >= text_len:
                chunk_content = text[start:text_len].strip()
                if chunk_content:
                    # If this trailing fragment is small, merge it with the last chunk on this page
                    # to prevent content loss and avoid producing a tiny fragment chunk.
                    if chunks and len(chunk_content) < MIN_CHUNK_SIZE:
                        chunks[-1]["content"] = (chunks[-1]["content"] + " " + chunk_content).strip()
                    else:
                        chunks.append({
                            "content": chunk_content,
                            "page_number": page_number
                        })
                break
            
            # Find the best semantic cut point 'end' in [start + CHUNK_OVERLAP + 20, start + CHUNK_SIZE]
            min_boundary_idx = start + CHUNK_OVERLAP + 20
            max_boundary_idx = start + CHUNK_SIZE
            
            # 1. Look for paragraph boundaries
            p_cuts = [b for b in paragraph_boundaries if min_boundary_idx <= b <= max_boundary_idx]
            if p_cuts:
                end = p_cuts[-1]
            else:
                # 2. Look for sentence boundaries
                s_cuts = [b for b in sentence_boundaries if min_boundary_idx <= b <= max_boundary_idx]
                if s_cuts:
                    end = s_cuts[-1]
                else:
                    # 3. Look for sentence boundaries in extended range up to MAX_CHUNK_SIZE
                    extended_cuts = [b for b in sentence_boundaries if min_boundary_idx <= b <= start + MAX_CHUNK_SIZE]
                    if extended_cuts:
                        end = extended_cuts[0]  # Pick the first one to avoid going too far
                    else:
                        # 4. Hard character cut fallback
                        end = start + CHUNK_SIZE
            
            chunk_content = text[start:end].strip()
            if chunk_content:
                if chunks and len(chunk_content) < MIN_CHUNK_SIZE:
                    # Merge short intermediate chunks with last chunk
                    chunks[-1]["content"] = (chunks[-1]["content"] + " " + chunk_content).strip()
                else:
                    chunks.append({
                        "content": chunk_content,
                        "page_number": page_number
                    })
            
            # Progress start index
            next_start = end - CHUNK_OVERLAP
            if next_start <= start:
                next_start = start + 50  # Enforce forward progress to prevent infinite loops
            
            start = next_start
            
    return chunks
