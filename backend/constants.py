"""Shared constants and enums for MemoryOS backend."""
from enum import Enum

EMBEDDING_DIM: int = 384
EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
CHUNK_SIZE: int = 500
CHUNK_OVERLAP: int = 100
MIN_CHUNK_SIZE: int = 100
MAX_CHUNK_SIZE: int = 800
TOP_K_RETRIEVAL: int = 8
RERANK_CANDIDATE_POOL_SIZE: int = 15
RERANK_MODE: str = "cross_encoder"  # Mode can be 'cross_encoder' or 'gemini'
SIMILARITY_THRESHOLD: float = 0.20
DISPLAY_THRESHOLD: float = 0.25
RELATED_FILES_TOP_K: int = 5
RELATED_FILES_CANDIDATE_MULTIPLIER: int = 5
RELATED_FILES_MIN_SCORE: float = 0.30
RECENT_FILES_LIMIT: int = 10
FREQUENT_SEARCHES_LIMIT: int = 8
GRAPH_MAX_FILE_NODES: int = 50
GRAPH_SIMILARITY_THRESHOLD: float = 0.35
GRAPH_MAX_EDGES: int = 300
MAX_UPLOAD_MB: int = 20
ALLOWED_IMAGE_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
MAX_IMAGE_UPLOAD_MB: int = 10
MIN_OCR_TEXT_LEN_FOR_TAGGING: int = 40
JWT_EXPIRE_MINUTES: int = 60
MAX_SUMMARY_INPUT_CHARS: int = 12000
MAX_HISTORY_MESSAGES: int = 5

class SourceType(str, Enum):
    PDF = "pdf"
    SCREENSHOT = "screenshot"

class FileStatus(str, Enum):
    UPLOADING = "uploading"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"

class LLMModel(str, Enum):
    GEMINI_FLASH = "gemini-2.5-flash"
    GROQ_MODEL = "llama-3.3-70b-versatile"

class GeminiTask(str, Enum):
    SUMMARIZE = "summarize"
    QA = "qa"
    TOPIC_EXTRACT = "topic_extraction"
    TAG_GENERATE = "tag_generation"
    REFORMULATE = "reformulate"


class OAuthProvider(str, Enum):
    LOCAL = "local"
    GOOGLE = "google"
    GITHUB = "github"

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
