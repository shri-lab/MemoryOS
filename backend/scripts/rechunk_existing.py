import asyncio
import sys
from uuid import UUID
from sqlalchemy import text
from db.session import AsyncSessionLocal
from services.pdf_service import download_from_storage, extract_text_from_pdf, chunk_text

async def test_rechunk(file_id_str: str):
    try:
        file_id = UUID(file_id_str)
    except ValueError:
        print(f"Error: Invalid UUID format '{file_id_str}'")
        return

    print(f"=== Starting Re-Chunking Audit for File ID: {file_id} ===", flush=True)

    async with AsyncSessionLocal() as session:
        # Fetch file record
        res = await session.execute(
            text("SELECT id, filename, storage_path, user_id FROM files WHERE id = :file_id"),
            {"file_id": file_id}
        )
        file_row = res.fetchone()
        if not file_row:
            print(f"Error: File ID {file_id} not found in database.")
            return

        filename = file_row[1]
        storage_path = file_row[2]
        print(f"File Name: {filename}")
        print(f"Storage Path: {storage_path}")

        # Fetch existing chunks
        chunks_res = await session.execute(
            text("SELECT content, page_number FROM chunks WHERE file_id = :file_id ORDER BY page_number ASC, created_at ASC"),
            {"file_id": file_id}
        )
        old_chunks = chunks_res.fetchall()
        print(f"Old Chunk Count in DB: {len(old_chunks)}")

        # Download original PDF bytes
        print("Downloading PDF bytes from Supabase storage...", flush=True)
        try:
            file_bytes = download_from_storage(storage_path)
        except Exception as e:
            print(f"Error downloading from storage: {e}")
            return

        # Extract text page-by-page
        print("Extracting text page-by-page using pdfplumber...", flush=True)
        pages_data = extract_text_from_pdf(file_bytes)

        # Run boundary-aware chunking
        print("Running new boundary-aware chunking algorithm...", flush=True)
        new_chunks = chunk_text(pages_data)
        print(f"New Chunk Count: {len(new_chunks)}")

        # Print comparison
        print("\n=== Comparative Samples (First 3 Old Chunks vs First 3 New Chunks) ===", flush=True)
        print("\n--- OLD CHUNKS (Naive Split) ---")
        for idx, oc in enumerate(old_chunks[:3]):
            content_snippet = oc[0].replace('\n', ' ')[:160] + "..." if len(oc[0]) > 160 else oc[0]
            print(f"[{idx+1}] Page {oc[1]} | Length: {len(oc[0])} | Snippet: {content_snippet}")

        print("\n--- NEW CHUNKS (Boundary-Aware & Overlapping) ---")
        for idx, nc in enumerate(new_chunks[:3]):
            content = nc["content"]
            content_snippet = content.replace('\n', ' ')[:160] + "..." if len(content) > 160 else content
            print(f"[{idx+1}] Page {nc['page_number']} | Length: {len(content)} | Snippet: {content_snippet}")

        # Overlap verification
        if len(new_chunks) > 1:
            print("\n=== Overlap Alignment Verification ===", flush=True)
            for idx in range(min(2, len(new_chunks) - 1)):
                c1 = new_chunks[idx]["content"]
                c2 = new_chunks[idx+1]["content"]
                
                # Check how much trailing text from c1 matches starting text of c2
                # Let's find overlapping phrases/words
                c1_words = c1.split()
                c2_words = c2.split()
                
                # Simple intersection search
                overlap_phrase = []
                for size in range(min(len(c1_words), 12), 0, -1):
                    suffix = " ".join(c1_words[-size:])
                    if c2.startswith(suffix):
                        overlap_phrase = c1_words[-size:]
                        break
                
                print(f"Chunk {idx+1} -> Chunk {idx+2} Overlap Phrase: \"{' '.join(overlap_phrase)}\"")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 rechunk_existing.py <file_id>")
        sys.exit(1)
    asyncio.run(test_rechunk(sys.argv[1]))
