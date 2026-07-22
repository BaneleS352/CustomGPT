from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.message import MessageRead


class ChatCreate(BaseModel):
    gpt_id: int
    title: str = "New chat"


class ChatRead(BaseModel):
    id: int
    gpt_id: int
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageRead] = []

    class Config:
        from_attributes = True


class SendMessage(BaseModel):
    content: str = Field(min_length=1)
