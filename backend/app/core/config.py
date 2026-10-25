from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    ENVIRONMENT: str = "development"
    SECRET_KEY: str
    FB_APP_SECRET: str = ""  
    
    # Comma-separated. In production, set this to the origin your Instant Game
    # is served from (check the Network tab once the game loads on Facebook).
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def DATABASE_URL(self) -> str:
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # Local runs from backend/ read the repo-root .env. In Docker and CI the
    # values come from real environment variables, which take priority.
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")


settings = Settings()