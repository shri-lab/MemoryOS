"""
FastAPI app entry, includes health router + CORS (real, from Task 0.1)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from routes.health import router as health_router
from routes.auth import router as auth_router
from routes.files import router as files_router
from routes.search import router as search_router
from routes.conversations import router as conversations_router
from routes.graph import router as graph_router
from config import get_settings

settings = get_settings()

app = FastAPI(title="MemoryOS API")

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(files_router)
app.include_router(search_router)
app.include_router(conversations_router)
app.include_router(graph_router)

# trigger reload 6

