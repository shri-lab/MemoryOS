"""
Embedding service for generating text embeddings using sentence-transformers.
Fills in Task 2.2 embedding generation logic.
"""

import logging
from sentence_transformers import SentenceTransformer
from constants import EMBEDDING_MODEL

logger = logging.getLogger(__name__)

logger.info(f"Loading SentenceTransformer model '{EMBEDDING_MODEL}' once at module import time...")
try:
    model = SentenceTransformer(EMBEDDING_MODEL)
    logger.info("SentenceTransformer model loaded successfully.")
except Exception as e:
    logger.critical(f"Failed to load SentenceTransformer model '{EMBEDDING_MODEL}': {e}")
    raise e


def generate_embedding(text: str) -> list[float]:
    """
    Generates a 384-dimensional embedding vector for a single text string.
    
    Args:
        text: The string to be embedded.
        
    Returns:
        A list of floats representing the 384-dim vector.
    """
    try:
        embedding = model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        raise e


def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """
    Generates embedding vectors for a list of text strings in a single batch.
    Natively batches within sentence-transformers for optimized execution.
    
    Args:
        texts: A list of strings to be embedded.
        
    Returns:
        A list of lists of floats.
    """
    if not texts:
        return []
    try:
        embeddings = model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
    except Exception as e:
        logger.error(f"Failed to generate batch embeddings: {e}")
        raise e
