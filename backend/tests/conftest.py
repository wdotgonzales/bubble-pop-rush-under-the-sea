import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db
from app.core.config import settings
from app.main import app

# Override host to localhost for local pytest execution if 'db' is unreachable or set
test_database_url = settings.DATABASE_URL.replace("@db:", "@localhost:")

engine = create_engine(test_database_url)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(autouse=True)
def override_get_db(db_session):
    """Override FastAPI's get_db dependency to use the test session and transaction."""
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass
            
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.clear()