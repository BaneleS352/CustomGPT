import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.llm import NormalizedMessage, NormalizedRequest, get_provider_adapter
from app.models.chat import Chat
from app.models.message import Message
from app.schemas.chat import ChatCreate, ChatRead, SendMessage
from app.services.chat_service import add_message, create_chat, delete_chat, get_chat, list_chats
from app.services.gpt_service import format_gpt_knowledge_for_prompt, get_gpt

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("", response_model=list[ChatRead])
def all_chats(db: Session = Depends(get_db)):
    return list_chats(db)


@router.post("", response_model=ChatRead)
def create(payload: ChatCreate, db: Session = Depends(get_db)):
    gpt = get_gpt(db, payload.gpt_id)
    if not gpt or not gpt.enabled:
        raise HTTPException(status_code=400, detail="Enabled GPT not found")
    return create_chat(db, gpt, payload.title)


@router.get("/{chat_id}", response_model=ChatRead)
def read(chat_id: int, db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.delete("/{chat_id}")
def delete(chat_id: int, db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    delete_chat(db, chat)
    return {"ok": True}


@router.post("/{chat_id}/messages", response_model=ChatRead)
def message(chat_id: int, payload: SendMessage, db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    add_message(db, chat, "user", payload.content)
    return chat


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/{chat_id}/stream")
def stream(chat_id: int, payload: SendMessage, db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not chat.gpt.enabled:
        raise HTTPException(status_code=400, detail="This GPT is disabled")
    if not chat.gpt.provider or not chat.gpt.provider.enabled:
        raise HTTPException(status_code=400, detail="Provider is not configured or disabled")

    add_message(db, chat, "user", payload.content)
    messages = [NormalizedMessage(role=m.role, content=m.content) for m in chat.messages]
    request = NormalizedRequest(
        messages=messages,
        instructions=f"{chat.gpt.instructions}\n\nKnowledge:\n{format_gpt_knowledge_for_prompt(chat.gpt)}".strip(),
        model=chat.gpt.model_id or chat.gpt.provider.default_model,
        temperature=chat.gpt.temperature,
        max_output_tokens=chat.gpt.max_output_tokens,
    )
    adapter = get_provider_adapter(chat.gpt.provider)
    provider_kind = chat.gpt.provider.kind

    def generate():
        content = ""
        yield sse("meta", {"provider": provider_kind, "mock": not bool(adapter._api_key()) and provider_kind != "ollama"})
        for event in adapter.stream_response(request):
            if event.type == "delta":
                content += event.content
                yield sse("delta", {"content": event.content})
            elif event.type == "error":
                yield sse("error", {"error": event.error})
                return
        write_db = SessionLocal()
        try:
            persisted = write_db.get(Chat, chat_id)
            if persisted and content.strip():
                write_db.add(Message(chat_id=chat_id, role="assistant", content=content.strip()))
                write_db.commit()
        finally:
            write_db.close()
        yield sse("done", {"content": content.strip()})

    return StreamingResponse(generate(), media_type="text/event-stream")
