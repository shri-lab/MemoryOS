"""
Settings configuration
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    SUPABASE_STORAGE_URL: str = os.getenv("SUPABASE_STORAGE_URL", "")
    SUPABASE_STORAGE_KEY: str = os.getenv("SUPABASE_STORAGE_KEY", "")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

def get_settings() -> Settings:
    return Settings()
