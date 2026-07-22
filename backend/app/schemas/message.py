from datetime import datetime
from pydantic import BaseModel


class MessageCreate(BaseModel):
    role: str
    content: str


class MessageRead(MessageCreate):
    id: int
    chat_id: int
    created_at: datetime

    class Config:
        from_attributes = True
