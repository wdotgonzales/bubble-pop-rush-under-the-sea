from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, rounds, session
from app.core.config import settings

app = FastAPI(title="Game Challenge API", version="1.0.0")

# CORS is on in every environment: the Instant Game runs on Facebook's domain,
# not ours. We use a bearer token (no cookies), so credentials stay off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(session.router)
app.include_router(rounds.router)
