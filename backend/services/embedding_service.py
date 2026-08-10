"""
Embedding service for generating text embeddings using sentence-transformers.
Fills in Task 2.2 embedding generation logic.
"""

import logging
import torch
from sentence_transformers import SentenceTransformer
from constants import EMBEDDING_MODEL

logger = logging.getLogger(__name__)

# Optimize PyTorch CPU execution parameters to prevent high latency on concurrent/async threads
torch.set_grad_enabled(False)
torch.set_num_threads(1)

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
        with torch.no_grad():
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
        with torch.no_grad():
            embeddings = model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
    except Exception as e:
        logger.error(f"Failed to generate batch embeddings: {e}")
        raise e


def mean_pool_embeddings(embeddings_list: list[list[float]]) -> list[float]:
    """
    Computes an element-wise average (mean-pooling) across a list of embedding vectors.
    
    Args:
        embeddings_list: A non-empty list of 384-dimensional float vectors.
        
    Returns:
        A single 384-dimensional float vector representing the document centroid.
        
    Raises:
        ValueError: If embeddings_list is empty.
    """
    if not embeddings_list:
        raise ValueError("Cannot mean-pool an empty list of embeddings.")

    dim = len(embeddings_list[0])
    num_vectors = len(embeddings_list)

    mean_vec = [0.0] * dim
    for vec in embeddings_list:
        for i in range(dim):
            mean_vec[i] += vec[i]

    return [v / num_vectors for v in mean_vec]
