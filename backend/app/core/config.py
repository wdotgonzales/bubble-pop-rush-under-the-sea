import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine current environment, defaulting to development if not set
current_env = os.getenv("ENVIRONMENT", "development")

# Dynamically pick the root .env file when running locally from backend/ folder, 
# or standard .env when running inside Docker/production
env_file_path = "../.env" if not os.getenv("ENVIRONMENT") or current_env == "development" else ".env"
print(env_file_path)

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