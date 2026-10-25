from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.core.config import settings

# --- Safety: switch to the test database BEFORE importing anything that
# --- creates an engine, and refuse to run against anything else.
assert settings.ENVIRONMENT != "production", "Refusing to run tests in production"
TEST_DB = f"{settings.POSTGRES_DB}_test"
settings.POSTGRES_DB = TEST_DB
assert settings.POSTGRES_DB.endswith("_test")

# Create the test database if it does not exist yet.
_admin_url = settings.DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
_admin = create_engine(_admin_url, isolation_level="AUTOCOMMIT")
with _admin.connect() as conn:
    exists = conn.execute(
        text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB}
    ).scalar()
    if not exists:
        conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
_admin.dispose()

import app.models  # noqa: E402,F401
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def _migrated_database():
    """Start every test session from an empty schema built by the real migrations."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables():
    """Empty every table after each test so tests never leak into each other."""
    yield
    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    if names:
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

FB_TEST_SECRET = "test-app-secret"


@pytest.fixture
def fb_secret(monkeypatch):
    """Give the app a known Facebook app secret so tests can sign player info."""
    monkeypatch.setattr(settings, "FB_APP_SECRET", FB_TEST_SECRET)
    return FB_TEST_SECRET
