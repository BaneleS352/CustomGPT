from sqlalchemy.orm import Session

from app.models.chat import Chat
from app.models.gpt import GPT
from app.models.message import Message


def list_chats(db: Session):
    return db.query(Chat).order_by(Chat.updated_at.desc()).all()


def get_chat(db: Session, chat_id: int):
    return db.get(Chat, chat_id)


def create_chat(db: Session, gpt: GPT, title: str = "New chat"):
    chat = Chat(gpt_id=gpt.id, title=title or "New chat")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def add_message(db: Session, chat: Chat, role: str, content: str):
    message = Message(chat_id=chat.id, role=role, content=content)
    if role == "user" and chat.title == "New chat":
        chat.title = content[:80]
    db.add(message)
    db.commit()
    db.refresh(message)
    db.refresh(chat)
    return message


def delete_chat(db: Session, chat: Chat):
    db.delete(chat)
    db.commit()
