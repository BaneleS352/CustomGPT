from sqlalchemy.orm import Session

from app.models.gpt import GPT, Provider
from app.schemas.gpt import GPTCreate, GPTUpdate, ProviderCreate, ProviderUpdate


def list_gpts(db: Session, enabled_only: bool = False):
    query = db.query(GPT).order_by(GPT.updated_at.desc())
    if enabled_only:
        query = query.filter(GPT.enabled.is_(True))
    return query.all()


def get_gpt(db: Session, gpt_id: int):
    return db.get(GPT, gpt_id)


def create_gpt(db: Session, payload: GPTCreate):
    gpt = GPT(**payload.model_dump())
    db.add(gpt)
    db.commit()
    db.refresh(gpt)
    return gpt


def update_gpt(db: Session, gpt: GPT, payload: GPTUpdate):
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(gpt, key, value)
    db.commit()
    db.refresh(gpt)
    return gpt


def list_providers(db: Session):
    return db.query(Provider).order_by(Provider.name.asc()).all()


def get_provider(db: Session, provider_id: int):
    return db.get(Provider, provider_id)


def create_provider(db: Session, payload: ProviderCreate):
    provider = Provider(**payload.model_dump())
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def update_provider(db: Session, provider: Provider, payload: ProviderUpdate):
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(provider, key, value)
    db.commit()
    db.refresh(provider)
    return provider
