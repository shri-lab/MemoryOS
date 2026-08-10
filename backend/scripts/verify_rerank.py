import asyncio
import logging
import time
from uuid import UUID
from sqlalchemy import text
from db.session import AsyncSessionLocal
from services import embedding_service, vector_search_service, rerank_service
from constants import TOP_K_RETRIEVAL, RERANK_CANDIDATE_POOL_SIZE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("verify_rerank")

async def test_reranking():
    user_id = UUID("f8a3964b-c22a-4e25-a8f3-129698c94651")
    question = "What is the check-in baggage allowance for Indigo flights?"
    
    print(f"=== Starting Re-Ranking Verification ===", flush=True)
    print(f"Query: '{question}'", flush=True)
    
    async with AsyncSessionLocal() as db:
        # 1. Generate query embedding
        print("Generating embedding...", flush=True)
        query_embedding = embedding_service.generate_embedding(question)
        
        # 2. Similarity search pulling a wider pool of candidates
        print(f"Pulling RERANK_CANDIDATE_POOL_SIZE ({RERANK_CANDIDATE_POOL_SIZE}) candidates...", flush=True)
        candidates = await vector_search_service.similarity_search(
            db=db,
            user_id=user_id,
            query_embedding=query_embedding,
            top_k=RERANK_CANDIDATE_POOL_SIZE
        )
        print(f"Retrieved {len(candidates)} candidates.", flush=True)
        if not candidates:
            print("No candidates found. Cannot verify.")
            return

        # 3. Test Cross-Encoder Re-Ranking
        print("\n--- Test Cross-Encoder Mode ---", flush=True)
        start_time = time.time()
        ce_ranked = rerank_service.rerank_cross_encoder(question, candidates, TOP_K_RETRIEVAL)
        ce_latency = time.time() - start_time
        print(f"Cross-Encoder completed in {ce_latency:.4f}s. Returned {len(ce_ranked)} chunks.", flush=True)
        print("Top 3 Cross-Encoder Chunks:")
        for idx, c in enumerate(ce_ranked[:3]):
            print(f"  [{idx+1}] ID: {c['chunk_id']} | Score: {c.get('rerank_score'):.4f} | Filename: {c['filename']}")

        # 4. Test Gemini Re-Ranking
        print("\n--- Test Gemini Mode ---", flush=True)
        start_time = time.time()
        gemini_ranked = await rerank_service.rerank_gemini(question, candidates, TOP_K_RETRIEVAL)
        gemini_latency = time.time() - start_time
        print(f"Gemini completed in {gemini_latency:.4f}s. Returned {len(gemini_ranked)} chunks.", flush=True)
        print("Top 3 Gemini Chunks:")
        for idx, c in enumerate(gemini_ranked[:3]):
            print(f"  [{idx+1}] ID: {c['chunk_id']} | Filename: {c['filename']}")

        # 5. Test Fallback Mechanism upon Error
        print("\n--- Test Exception Fallback Mechanism ---", flush=True)
        # Induce an error in Cross-Encoder by passing None instead of string question
        fallback_ranked = rerank_service.rerank_cross_encoder(None, candidates, TOP_K_RETRIEVAL)
        print(f"Fallback count: {len(fallback_ranked)} chunks.", flush=True)
        assert len(fallback_ranked) == TOP_K_RETRIEVAL
        # Verify fallback ordered matches plain similarity search top TOP_K
        for idx in range(TOP_K_RETRIEVAL):
            assert fallback_ranked[idx]["chunk_id"] == candidates[idx]["chunk_id"]
        print("SUCCESS: Fallback returned plain similarity search order correctly without crashing!", flush=True)

if __name__ == "__main__":
    asyncio.run(test_reranking())
