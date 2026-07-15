"""
LLM Service wrapper for interacting with Google Gemini API or Groq API (as fallback).
Fills in Task 2.4 document summarization and topic extraction logic, and
Task 2.5 grounded question answering.
"""

import json
import logging
from google import genai
from google.genai.errors import APIError
from groq import AsyncGroq
from groq import GroqError

from config import get_settings
from constants import LLMModel, MAX_SUMMARY_INPUT_CHARS, GeminiTask

logger = logging.getLogger(__name__)

# Load settings and initialize Client
settings = get_settings()

groq_client = None
gemini_client = None

# Initialize both clients if their keys are present to support dynamic fallback
if settings.GROQ_API_KEY:
    logger.info("Initializing Groq client for LLM service...")
    groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
if settings.GEMINI_API_KEY:
    logger.info("Initializing Gemini client for LLM service...")
    gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
    logger.warning("Neither GROQ_API_KEY nor GEMINI_API_KEY are defined in backend settings configurations.")


class LlmServiceError(Exception):
    """Custom exception raised when LLM generation or formatting fails."""
    pass


async def _call_llm_with_fallback(prompt: str, task: GeminiTask) -> str:
    """
    Shared internal helper to execute LLM calls with Gemini as the primary path
    and Groq Llama 3.3 as the fallback path upon any rate-limit or API failure.
    
    Args:
        prompt: The complete formatted prompt text.
        task: The GeminiTask enum specifying the task type.
        
    Returns:
        The generated content response text.
        
    Raises:
        LlmServiceError: If both providers fail or are unconfigured.
    """
    last_err = None
    
    # 1. Primary path: Try Gemini if client is initialized
    if gemini_client is not None:
        try:
            logger.info(f"Calling Gemini API via aio for task: {task.value}...")
            response = await gemini_client.aio.models.generate_content(
                model=LLMModel.GEMINI_FLASH.value,
                contents=prompt
            )
            if response.text:
                logger.info(f"Gemini call succeeded for task: {task.value}")
                return response.text.strip()
            raise LlmServiceError("Gemini generated an empty response.")
        except APIError as sdk_err:
            logger.warning(
                f"Gemini API failure during {task.value} (will attempt Groq fallback): {sdk_err}"
            )
            last_err = sdk_err
        except Exception as e:
            logger.warning(
                f"Unexpected Gemini exception during {task.value} (will attempt Groq fallback): {e}"
            )
            last_err = e

    # 2. Fallback path: Try Groq if client is initialized
    if groq_client is not None:
        try:
            logger.info(f"Falling back to Groq API (model: {LLMModel.GROQ_MODEL.value}) for task: {task.value} due to: {last_err}")
            response = await groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=LLMModel.GROQ_MODEL.value,
                temperature=0.2,
            )
            content = response.choices[0].message.content
            if content:
                logger.info(f"Groq fallback call succeeded for task: {task.value}")
                return content.strip()
            raise LlmServiceError("Groq generated an empty response.")
        except GroqError as groq_err:
            logger.error(f"Groq API failure during {task.value}: {groq_err}", exc_info=groq_err)
            raise LlmServiceError(f"Groq SDK failure: {groq_err}") from groq_err
        except Exception as e:
            logger.error(f"Unexpected Groq exception during {task.value}: {e}", exc_info=e)
            raise LlmServiceError(f"Unexpected LLM service error during Groq: {e}") from e

    # 3. Error state if both paths fail or are missing
    if last_err:
        raise LlmServiceError(f"All LLM providers failed. Gemini failed with: {last_err}")
    raise LlmServiceError("No LLM client (Gemini or Groq) is configured. Check settings and environment variables.")


async def summarize_document(text: str) -> str:
    """
    Generates a concise 2-4 sentence summary of the provided document text.
    Truncates text to MAX_SUMMARY_INPUT_CHARS before sending to prevent API payload limits.
    
    Args:
        text: Raw document text to summarize.
        
    Returns:
        concise 2-4 sentence summary string.
        
    Raises:
        LlmServiceError: If the LLM generation fails.
    """
    if not text or not text.strip():
        return ""
        
    truncated_text = text[:MAX_SUMMARY_INPUT_CHARS]
    
    prompt = (
        "You are an expert document summarization assistant.\n"
        "Read the following text and write a concise 2 to 4 sentence summary of the main points. "
        "Do not include any introductory sentences like 'Here is the summary:' or any extra metadata. "
        "Go straight to the summarized information.\n\n"
        f"Document Text:\n{truncated_text}"
    )
    
    return await _call_llm_with_fallback(prompt, GeminiTask.SUMMARIZE)


async def extract_topics(text: str) -> list[str]:
    """
    Extracts 3-7 short topic strings representing key themes from the text.
    Enforces a strict JSON array return format, parses it safely,
    and returns a clean list of topic strings.
    
    Args:
        text: Raw document text.
        
    Returns:
        List of topic strings (3-7 items).
        
    Raises:
        LlmServiceError: If LLM generation fails or returns invalid/unparseable JSON.
    """
    if not text or not text.strip():
        return []
        
    truncated_text = text[:MAX_SUMMARY_INPUT_CHARS]
    
    prompt = (
        "You are a key theme and topic extraction model.\n"
        "Extract between 3 and 7 short, high-level topic strings that represent the key themes of this document.\n"
        "Your response MUST be ONLY a JSON array of strings. Do not include markdown code blocks, "
        "backticks (like ```json), or explanatory text.\n"
        'Example valid response: ["Python Programming", "PostgreSQL Databases", "FastAPI Framework"]\n\n'
        f"Document Text:\n{truncated_text}"
    )
    
    raw_content = await _call_llm_with_fallback(prompt, GeminiTask.TOPIC_EXTRACT)
    
    clean_text = raw_content.strip()
    
    # Safe cleanup of accidental markdown blocks
    if clean_text.startswith("```"):
        lines = clean_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        clean_text = "\n".join(lines).strip()
        
    try:
        topics = json.loads(clean_text)
        if not isinstance(topics, list):
            raise ValueError("Parsed JSON is not a list structure.")
            
        return [str(t).strip() for t in topics if t]
    except Exception as json_err:
        logger.error(f"Failed to parse JSON topics from LLM response '{raw_content}': {json_err}")
        raise LlmServiceError(f"Malformed JSON response from LLM: {json_err}")


async def answer_question(question: str, context_chunks: list[dict]) -> str:
    """
    Answers a question strictly grounded in the provided document context chunks.
    
    Args:
        question: The user's query/question.
        context_chunks: List of dictionaries representing text chunks, each containing content: str,
                       filename: str, page_number: int | None.
                       
    Returns:
        The grounded answer string.
        
    Raises:
        LlmServiceError: If the LLM generation fails.
    """
    if not question or not question.strip():
        return ""
    if not context_chunks:
        return "I don't have enough information in your documents to answer that."
        
    # Format the source chunks clearly in the prompt
    sources_text = ""
    for i, chunk in enumerate(context_chunks):
        filename = chunk.get("filename", "Unknown File")
        page = chunk.get("page_number")
        page_lbl = f"page {page}" if page is not None else "page unknown"
        content = chunk.get("content", "").strip()
        sources_text += f"\n[Source {i+1}: {filename}, {page_lbl}]:\n{content}\n"
        
    prompt = (
        "You are an expert document-grounded question-answering assistant.\n"
        "Answer the user's question STRICTLY using the information from the sources provided below. "
        "If the answer cannot be found or inferred directly from these sources, your response "
        "MUST be exactly: 'I don't have enough information in your documents to answer that.'\n"
        "Do not use outside knowledge or hallucinate information that is not in the sources.\n\n"
        "Sources:\n"
        f"{sources_text.strip()}\n\n"
        f"Question: {question.strip()}\n"
        "Answer:"
    )
    
    return await _call_llm_with_fallback(prompt, GeminiTask.QA)
