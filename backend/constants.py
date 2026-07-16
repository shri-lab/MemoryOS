"""Shared constants and enums for MemoryOS backend."""
from enum import Enum

EMBEDDING_DIM: int = 384
EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
CHUNK_SIZE: int = 500
CHUNK_OVERLAP: int = 50
TOP_K_RETRIEVAL: int = 5
SIMILARITY_THRESHOLD: float = 0.20
MAX_UPLOAD_MB: int = 20
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
    GEMINI_FLASH = "gemini-3.5-flash"
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
