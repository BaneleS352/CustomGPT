import json
import base64
import re
import zlib
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.gpt import GPT, Provider
from app.schemas.gpt import GPTCreate, GPTUpdate, ProviderCreate, ProviderUpdate

KNOWLEDGE_PREFIX = "<<<CUSTOMGPT_KNOWLEDGE_V1>>>"
KNOWLEDGE_SUFFIX = "<<<END_CUSTOMGPT_KNOWLEDGE_V1>>>"


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


def serialize_knowledge_payload(notes: str, files: list[dict[str, str]]) -> str:
    return f"{KNOWLEDGE_PREFIX}\n{json.dumps({'notes': notes, 'files': files}, ensure_ascii=True)}\n{KNOWLEDGE_SUFFIX}"


def parse_knowledge_payload(value: str) -> tuple[str, list[dict[str, str]]] | None:
    if not value.startswith(KNOWLEDGE_PREFIX):
        return None
    if not value.endswith(KNOWLEDGE_SUFFIX):
        return None
    body = value[len(KNOWLEDGE_PREFIX):]
    body = body[: body.rfind(KNOWLEDGE_SUFFIX)].strip()
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return None
    notes = data.get("notes", "")
    files = data.get("files", [])
    if not isinstance(notes, str) or not isinstance(files, list):
        return None
    normalized_files = [
        {"name": str(item.get("name", "")), "content": str(item.get("content", ""))}
        for item in files
        if isinstance(item, dict) and item.get("name")
    ]
    return notes, normalized_files


def format_knowledge_for_prompt(value: str) -> str:
    parsed = parse_knowledge_payload(value)
    if not parsed:
        return value
    notes, files = parsed
    sections: list[str] = []
    if notes.strip():
        sections.append(f"Notes:\n{notes.strip()}")
    if files:
        file_blocks = [f"File: {item['name']}\n{item['content'].strip()}".strip() for item in files if item.get("content", "").strip()]
        if file_blocks:
            sections.append("Knowledge files:\n" + "\n\n".join(file_blocks))
    return "\n\n".join(sections).strip()


def extract_knowledge_files(files: list[dict[str, str]]) -> list[dict[str, str]]:
    extracted: list[dict[str, str]] = []
    for upload in files:
        name = upload.get("name") or "knowledge-file"
        encoded = upload.get("content_base64", "")
        try:
            content = base64.b64decode(encoded)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid file encoding for {name}") from exc
        text = _extract_file_text(name, content)
        if not text.strip():
            raise HTTPException(status_code=400, detail=f"Could not extract readable text from {name}")
        extracted.append({"name": name, "content": text.strip()})
    return extracted


def _extract_file_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".md", ".csv", ".txt"}:
        return _decode_text(content)
    if suffix == ".docx":
        return _extract_docx_text(content)
    if suffix == ".pdf":
        return _extract_pdf_text(content)
    raise HTTPException(status_code=400, detail=f"Unsupported knowledge file type: {suffix or filename}")


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _extract_docx_text(content: bytes) -> str:
    try:
        with ZipFile(BytesIO(content)) as archive:
            names = [
                name
                for name in archive.namelist()
                if name == "word/document.xml" or (name.startswith("word/") and ("/header" in name or "/footer" in name))
            ]
            text_blocks = [_extract_docx_xml_text(archive.read(name)) for name in names]
    except BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"Invalid DOCX file: {exc}") from exc
    text = "\n\n".join(block for block in text_blocks if block.strip())
    if not text.strip():
        raise HTTPException(status_code=400, detail="DOCX file did not contain readable text")
    return text


def _extract_docx_xml_text(xml_bytes: bytes) -> str:
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    root = ElementTree.fromstring(xml_bytes)
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        runs = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
        line = "".join(runs).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def _extract_pdf_text(content: bytes) -> str:
    stream_pattern = re.compile(rb"<<.*?>>\s*stream\r?\n(.*?)\r?\nendstream", re.DOTALL)
    text_chunks: list[str] = []
    for match in stream_pattern.finditer(content):
        chunk = match.group(1)
        header = match.group(0).split(b"stream", 1)[0]
        if b"/FlateDecode" in header:
            try:
                chunk = zlib.decompress(chunk)
            except zlib.error:
                continue
        text_chunks.extend(_extract_pdf_text_chunks(chunk))
    text = "\n".join(part.strip() for part in text_chunks if part.strip())
    if text.strip():
        return text
    decoded = content.decode("latin-1", errors="ignore")
    fallback = " ".join(re.findall(r"[A-Za-z0-9][A-Za-z0-9 ,.;:()'\"/%-]{3,}", decoded))
    if fallback.strip():
        return fallback
    raise HTTPException(status_code=400, detail="PDF file did not contain extractable text")


def _extract_pdf_text_chunks(chunk: bytes) -> list[str]:
    decoded = chunk.decode("latin-1", errors="ignore")
    parts: list[str] = []
    for token in re.findall(r"\((?:\\.|[^()])*\)\s*Tj", decoded):
        parts.append(_decode_pdf_literal(token.split(")", 1)[0][1:]))
    for array_token in re.findall(r"\[(.*?)\]\s*TJ", decoded, re.DOTALL):
        literals = re.findall(r"\((?:\\.|[^()])*\)", array_token)
        joined = "".join(_decode_pdf_literal(item[1:-1]) for item in literals)
        if joined.strip():
            parts.append(joined)
    return parts


def _decode_pdf_literal(value: str) -> str:
    replacements = {
        r"\n": "\n",
        r"\r": "\r",
        r"\t": "\t",
        r"\b": "\b",
        r"\f": "\f",
        r"\(": "(",
        r"\)": ")",
        r"\\": "\\",
    }
    for key, replacement in replacements.items():
        value = value.replace(key, replacement)
    value = re.sub(r"\\([0-7]{1,3})", lambda match: chr(int(match.group(1), 8)), value)
    return value
