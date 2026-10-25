import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Game Challenge API", version="1.0.0", root_path="/api")

# If running locally, load variables from the root .env file one level up
if not os.getenv("ENVIRONMENT") or os.getenv("ENVIRONMENT") == "development":
    from dotenv import load_dotenv
    load_dotenv(dotenv_path="../.env")

# Conditionally enable CORS only in local development
if os.getenv("ENVIRONMENT") == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
@app.get("/")
def read_root():
    return {"message": "Local backend is running!"}