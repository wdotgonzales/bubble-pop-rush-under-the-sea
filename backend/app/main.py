from fastapi import FastAPI
from app.api import users

app = FastAPI(title="Game Challenge API", version="1.0.0", root_path="/api")

# Register the users router
app.include_router(users.router)

@app.get("/")
def read_root():
    return {"message": "Local backend is running!"}