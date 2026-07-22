from fastapi import FastAPI

app = FastAPI(title="GPT Backend")

@app.get("/")
def root():
    return {"message": "API is running"}