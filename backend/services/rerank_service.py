import json
import logging
from typing import List, Dict, Any
import torch
from google import genai
from google.genai import types
from sentence_transformers import CrossEncoder

from config import get_settings
from constants import LLMModel

logger = logging.getLogger(__name__)
settings = get_settings()

_cross_encoder_model = None
_gemini_client = None

def get_cross_encoder() -> CrossEncoder:
    """Lazy loads and caches the sentence-transformers CrossEncoder model."""
    global _cross_encoder_model
    if _cross_encoder_model is None:
        logger.info("Loading local cross-encoder model: cross-encoder/ms-marco-MiniLM-L-6-v2...")
        # Optimize PyTorch CPU execution threads and gradient tracking for local CPU speedup
        torch.set_grad_enabled(False)
        torch.set_num_threads(1)
        _cross_encoder_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _cross_encoder_model

def get_gemini_client() -> genai.Client:
    """Lazy loads and caches the Google GenAI client."""
    global _gemini_client
    if _gemini_client is None and settings.GEMINI_API_KEY:
        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_client

def rerank_cross_encoder(question: str, candidates: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    """
    Reranks candidate document chunks locally using ms-marco-MiniLM cross-encoder.
    On any model load or inference failure, falls back to raw vector similarity ordering.
    
    Args:
        question: The user query string.
        candidates: List of dictionary candidates returned from similarity search.
        top_k: Number of ranked results to return.
        
    Returns:
        List of top_k reranked candidates.
    """
    if not candidates:
        return []
    try:
        model = get_cross_encoder()
        pairs = [(question, c["content"]) for c in candidates]
        with torch.no_grad():
            scores = model.predict(pairs)
        
        scored_candidates = []
        for idx, score in enumerate(scores):
            cand = dict(candidates[idx])
            cand["rerank_score"] = float(score)
            scored_candidates.append(cand)
            
        # Sort descending by cross-encoder score
        scored_candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored_candidates[:top_k]
    except Exception as e:
        logger.error(f"Cross-encoder re-ranking failed: {e}. Falling back to plain similarity.", exc_info=True)
        return candidates[:top_k]

async def rerank_gemini(question: str, candidates: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    """
    Reranks candidate chunks by calling Google Gemini model asynchronously.
    Prompt instructs Gemini to identify the indices of the top_k most relevant chunks.
    On any failure (network error, JSON mismatch), falls back to plain similarity ordering.
    
    Args:
        question: The user query string.
        candidates: List of dictionary candidates returned from similarity search.
        top_k: Number of ranked results to return.
        
    Returns:
        List of top_k reranked candidates.
    """
    if not candidates:
        return []
    
    client = get_gemini_client()
    if not client:
        logger.warning("Gemini Client not initialized. Falling back to plain similarity.")
        return candidates[:top_k]
        
    try:
        # Build prompt containing numbered candidates
        formatted_list = []
        for idx, c in enumerate(candidates):
            snippet = c["content"].replace('\n', ' ')
            formatted_list.append(f"[{idx}] (File: {c['filename']}, Page: {c.get('page_number')}) {snippet}")
            
        formatted_candidates = "\n".join(formatted_list)
        
        prompt = f"""You are a helpful search assistant.
Your task is to re-rank the following document chunks and select the top {top_k} most relevant chunks to answer this question: "{question}"

Candidates:
{formatted_candidates}

Respond with a JSON object containing a single list "top_indices" of the indices (0-based) of the top {top_k} chunks in descending order of relevance.
Example output format:
{{
  "top_indices": [2, 0, 4]
}}
Do not include any other commentary, explanation, or markdown blocks outside the JSON payload.
"""

        logger.info(f"Calling Gemini asynchronously to rerank {len(candidates)} candidates...")
        response = await client.aio.models.generate_content(
            model=LLMModel.GEMINI_FLASH.value,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        if not response.text:
            raise ValueError("Gemini returned empty text response during re-ranking.")
            
        # Parse JSON indices
        data = json.loads(response.text.strip())
        indices = data.get("top_indices", [])
        
        if not isinstance(indices, list):
            raise ValueError("Invalid JSON schema: 'top_indices' is not a list.")
            
        # Map indices to candidates
        reranked = []
        seen = set()
        for idx in indices:
            try:
                i = int(idx)
                if 0 <= i < len(candidates) and i not in seen:
                    reranked.append(candidates[i])
                    seen.add(i)
            except (ValueError, TypeError):
                continue
                
        # Fill in missing slots from the candidate pool if Gemini returned fewer than top_k
        if len(reranked) < top_k:
            for c in candidates:
                if c["chunk_id"] not in [r["chunk_id"] for r in reranked]:
                    reranked.append(c)
                    if len(reranked) >= top_k:
                        break
                        
        return reranked[:top_k]
    except Exception as e:
        logger.error(f"Gemini re-ranking failed: {e}. Falling back to plain similarity.", exc_info=True)
        return candidates[:top_k]
