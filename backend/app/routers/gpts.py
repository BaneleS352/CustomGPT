from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm import get_provider_adapter
from app.models.gpt import GPT
from app.schemas.gpt import GPTCreate, GPTRead, GPTUpdate, KnowledgeExtractCreate, KnowledgeExtractRead, ProviderCreate, ProviderRead, ProviderUpdate
from app.services.gpt_service import (
    create_gpt,
    extract_knowledge_files,
    create_provider,
    get_gpt,
    get_provider,
    list_gpts,
    list_providers,
    update_gpt,
    update_provider,
)

router = APIRouter(prefix="/gpts", tags=["gpts"])
providers_router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[GPTRead])
def all_gpts(enabled_only: bool = False, db: Session = Depends(get_db)):
    return list_gpts(db, enabled_only)


@router.post("", response_model=GPTRead)
def create(payload: GPTCreate, db: Session = Depends(get_db)):
    if payload.provider_id and not get_provider(db, payload.provider_id):
        raise HTTPException(status_code=400, detail="Provider not found")
    return create_gpt(db, payload)


@router.post("/knowledge-files/extract", response_model=KnowledgeExtractRead)
def knowledge_files_extract(payload: KnowledgeExtractCreate):
    return {"files": extract_knowledge_files([item.model_dump() for item in payload.files])}


@router.get("/{gpt_id}", response_model=GPTRead)
def read(gpt_id: int, db: Session = Depends(get_db)):
    gpt = get_gpt(db, gpt_id)
    if not gpt:
        raise HTTPException(status_code=404, detail="GPT not found")
    return gpt


@router.put("/{gpt_id}", response_model=GPTRead)
def update(gpt_id: int, payload: GPTUpdate, db: Session = Depends(get_db)):
    gpt = get_gpt(db, gpt_id)
    if not gpt:
        raise HTTPException(status_code=404, detail="GPT not found")
    if payload.provider_id and not get_provider(db, payload.provider_id):
        raise HTTPException(status_code=400, detail="Provider not found")
    return update_gpt(db, gpt, payload)


@router.delete("/{gpt_id}")
def delete(gpt_id: int, db: Session = Depends(get_db)):
    gpt = get_gpt(db, gpt_id)
    if not gpt:
        raise HTTPException(status_code=404, detail="GPT not found")
    db.delete(gpt)
    db.commit()
    return {"ok": True}


@providers_router.get("", response_model=list[ProviderRead])
def providers(db: Session = Depends(get_db)):
    return list_providers(db)


@providers_router.post("", response_model=ProviderRead)
def provider_create(payload: ProviderCreate, db: Session = Depends(get_db)):
    return create_provider(db, payload)


@providers_router.get("/{provider_id}", response_model=ProviderRead)
def provider_read(provider_id: int, db: Session = Depends(get_db)):
    provider = get_provider(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@providers_router.put("/{provider_id}", response_model=ProviderRead)
def provider_update(provider_id: int, payload: ProviderUpdate, db: Session = Depends(get_db)):
    provider = get_provider(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return update_provider(db, provider, payload)


@providers_router.delete("/{provider_id}")
def provider_delete(provider_id: int, db: Session = Depends(get_db)):
    provider = get_provider(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(provider)
    db.commit()
    return {"ok": True}


@providers_router.post("/{provider_id}/test")
def provider_test(provider_id: int, db: Session = Depends(get_db)):
    provider = get_provider(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    adapter = get_provider_adapter(provider)
    ok, message = adapter.validate_configuration()
    return {"ok": ok, "message": message, "models": adapter.list_models()}


