from datetime import datetime
from pydantic import BaseModel, Field


class ProviderBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(pattern="^(openai|anthropic|gemini|ollama)$")
    base_url: str = ""
    api_key_env: str = ""
    default_model: str = ""
    enabled: bool = True


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    kind: str | None = Field(default=None, pattern="^(openai|anthropic|gemini|ollama)$")
    base_url: str | None = None
    api_key_env: str | None = None
    default_model: str | None = None
    enabled: bool | None = None


class ProviderRead(ProviderBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class KnowledgeFileRead(BaseModel):
    id: int | None = None
    name: str


class KnowledgeFileWrite(BaseModel):
    id: int | None = None
    name: str = Field(min_length=1, max_length=255)
    content: str = ""


class KnowledgeExtractFile(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=1)


class KnowledgeExtractCreate(BaseModel):
    files: list[KnowledgeExtractFile] = Field(min_length=1)


class KnowledgeExtractRead(BaseModel):
    files: list[KnowledgeFileRead]


class GPTBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    avatar: str = "AI"
    instructions: str = ""
    knowledge: str = ""
    enabled: bool = True
    provider_id: int | None = None
    model_id: str = ""
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_output_tokens: int = Field(default=800, ge=64, le=8000)
    knowledge_files: list[KnowledgeFileWrite] = []


class GPTCreate(GPTBase):
    pass


class GPTUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    avatar: str | None = None
    instructions: str | None = None
    knowledge: str | None = None
    enabled: bool | None = None
    provider_id: int | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_output_tokens: int | None = Field(default=None, ge=64, le=8000)
    knowledge_files: list[KnowledgeFileWrite] | None = None


class GPTRead(GPTBase):
    id: int
    created_at: datetime
    updated_at: datetime
    provider: ProviderRead | None = None
    knowledge_files: list[KnowledgeFileRead] = []
    chunk_count: int = 0

    class Config:
        from_attributes = True
