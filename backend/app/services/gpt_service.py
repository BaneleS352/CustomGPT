from sqlalchemy.orm import Session

from app.models.gpt import GPT, Provider
from app.schemas.gpt import GPTCreate, GPTUpdate, ProviderCreate, ProviderUpdate


DEFAULT_PROVIDERS = [
    {"name": "OpenAI Compatible", "kind": "openai", "base_url": "https://api.openai.com/v1", "api_key_env": "OPENAI_API_KEY", "default_model": "gpt-4o-mini"},
    {"name": "Anthropic", "kind": "anthropic", "base_url": "https://api.anthropic.com", "api_key_env": "ANTHROPIC_API_KEY", "default_model": "claude-3-5-sonnet-latest"},
    {"name": "Google Gemini", "kind": "gemini", "base_url": "https://generativelanguage.googleapis.com", "api_key_env": "GEMINI_API_KEY", "default_model": "gemini-1.5-flash"},
    {"name": "Ollama", "kind": "ollama", "base_url": "http://localhost:11434", "api_key_env": "", "default_model": "llama3.1"},
]


def seed_defaults(db: Session) -> None:
    if db.query(Provider).count() == 0:
        for item in DEFAULT_PROVIDERS:
            db.add(Provider(**item))
        db.commit()
    if db.query(GPT).count() == 0:
        provider = db.query(Provider).filter(Provider.kind == "openai").first()
        db.add(GPT(
            name="Product Helper",
            description="A general assistant for quick product and engineering thinking.",
            avatar="PH",
            instructions="You are concise, practical, and helpful.",
            provider_id=provider.id if provider else None,
            model_id=provider.default_model if provider else "gpt-4o-mini",
        ))
        db.commit()


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
