from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.models import Chat, GPT, Message, Provider
from app.routers.chats import router as chats_router
from app.routers.gpts import providers_router, router as gpts_router

app = FastAPI(title="Custom GPT MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"message": "Custom GPT MVP API is running"}


app.include_router(gpts_router)
app.include_router(providers_router)
app.include_router(chats_router)
