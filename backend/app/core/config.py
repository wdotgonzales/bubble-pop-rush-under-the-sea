import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine which env file to use based on system environment or default to development
current_env = os.getenv("ENVIRONMENT", "development")

# Choose path dynamically
env_file_path = "../.env" if current_env == "development" else ".env"

class Settings(BaseSettings):
    POSTGRES_USER: str = "wdotgonzales"
    POSTGRES_PASSWORD: str = "habbo123"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "bubble_pop_rush_db"
    ENVIRONMENT: str = "development"

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(
        env_file=env_file_path,
        extra="ignore"
    )

settings = Settings()