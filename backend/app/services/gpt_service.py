import json
import base64
import re
import zlib
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models.gpt import GPT, KnowledgeChunk, KnowledgeFile, Provider
from app.schemas.gpt import GPTCreate, GPTUpdate, ProviderCreate, ProviderUpdate

KNOWLEDGE_PREFIX = "<<<CUSTOMGPT_KNOWLEDGE_V1>>>"
KNOWLEDGE_SUFFIX = "<<<END_CUSTOMGPT_KNOWLEDGE_V1>>>"
CHUNK_TARGET_CHARS = 950
CHUNK_MAX_CHARS = 1200
CHUNK_OVERLAP_CHARS = 150
MAX_RETRIEVED_CHUNKS = 5
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9'-]{1,}", re.IGNORECASE)
STOPWORDS = {
    "about",
    "after",
    "also",
    "and",
    "are",
    "can",
    "could",
    "does",
    "for",
    "from",
    "have",
    "how",
    "into",
    "is",
    "it",
    "its",
    "me",
    "more",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
    "your",
}


def list_gpts(db: Session, enabled_only: bool = False):
    query = db.query(GPT).options(selectinload(GPT.knowledge_files), selectinload(GPT.knowledge_chunks)).order_by(GPT.updated_at.desc())
    if enabled_only:
        query = query.filter(GPT.enabled.is_(True))
    gpts = query.all()
    for gpt in gpts:
        _migrate_legacy_knowledge_payload(db, gpt)
    return gpts


def get_gpt(db: Session, gpt_id: int):
    gpt = db.query(GPT).options(selectinload(GPT.knowledge_files), selectinload(GPT.knowledge_chunks)).filter(GPT.id == gpt_id).first()
    if gpt:
        _migrate_legacy_knowledge_payload(db, gpt)
    return gpt


def create_gpt(db: Session, payload: GPTCreate):
    data = payload.model_dump()
    knowledge_files = data.pop("knowledge_files", [])
    gpt = GPT(**data)
    db.add(gpt)
    _replace_knowledge_files(gpt, knowledge_files)
    db.commit()
    db.refresh(gpt)
    return gpt


def update_gpt(db: Session, gpt: GPT, payload: GPTUpdate):
    _migrate_legacy_knowledge_payload(db, gpt)
    updates = payload.model_dump(exclude_unset=True)
    knowledge_files = updates.pop("knowledge_files", None)
    for key, value in updates.items():
        setattr(gpt, key, value)
    if knowledge_files is not None:
        _replace_knowledge_files(gpt, knowledge_files)
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


def format_gpt_knowledge_for_prompt(gpt: GPT) -> str:
    _migrate_legacy_knowledge_payload(None, gpt)
    sections: list[str] = []
    if (gpt.knowledge or "").strip():
        sections.append(f"Notes:\n{gpt.knowledge.strip()}")
    if gpt.knowledge_files:
        file_blocks = [f"File: {item.name}\n{item.content.strip()}".strip() for item in gpt.knowledge_files if item.content.strip()]
        if file_blocks:
            sections.append("Knowledge files:\n" + "\n\n".join(file_blocks))
    return "\n\n".join(sections).strip()


def format_retrieved_knowledge_for_prompt(gpt: GPT, chunks: list[KnowledgeChunk]) -> str:
    sections: list[str] = []
    if (gpt.knowledge or "").strip():
        sections.append(f"Notes:\n{gpt.knowledge.strip()}")
    if chunks:
        chunk_blocks = []
        for chunk in chunks:
            filename = chunk.knowledge_file.name if chunk.knowledge_file else "knowledge file"
            chunk_blocks.append(f"File: {filename} (chunk {chunk.chunk_index + 1})\n{chunk.content.strip()}")
        sections.append("Retrieved knowledge file excerpts:\n" + "\n\n".join(chunk_blocks))
    return "\n\n".join(sections).strip()


def retrieve_knowledge_chunks(db: Session, gpt_id: int, query_text: str, limit: int = MAX_RETRIEVED_CHUNKS) -> list[KnowledgeChunk]:
    query_tokens = _tokenize(query_text)
    if not query_tokens:
        return []

    chunks = (
        db.query(KnowledgeChunk)
        .options(selectinload(KnowledgeChunk.knowledge_file))
        .filter(KnowledgeChunk.gpt_id == gpt_id)
        .all()
    )
    scored = [(_score_chunk(chunk.content, query_tokens, query_text), chunk) for chunk in chunks if chunk.content.strip()]
    scored = [(score, chunk) for score, chunk in scored if score > 0]
    scored.sort(key=lambda item: (item[0], -item[1].chunk_index), reverse=True)
    return [chunk for _, chunk in scored[:limit]]


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
    if suffix == ".xlsx":
        return _extract_xlsx_text(content)
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


def _extract_xlsx_text(content: bytes) -> str:
    try:
        with ZipFile(BytesIO(content)) as archive:
            shared_strings = _extract_xlsx_shared_strings(archive)
            sheet_names = sorted(name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", name))
            sheet_blocks = [_extract_xlsx_sheet_text(archive.read(name), shared_strings) for name in sheet_names]
    except BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"Invalid XLSX file: {exc}") from exc
    text = "\n\n".join(block for block in sheet_blocks if block.strip())
    if not text.strip():
        raise HTTPException(status_code=400, detail="XLSX file did not contain readable text")
    return text


def _extract_xlsx_shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall(".//x:si", namespace):
        parts = [node.text or "" for node in item.findall(".//x:t", namespace)]
        strings.append("".join(parts))
    return strings


def _extract_xlsx_sheet_text(xml_bytes: bytes, shared_strings: list[str]) -> str:
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ElementTree.fromstring(xml_bytes)
    rows: list[str] = []
    for row in root.findall(".//x:sheetData/x:row", namespace):
        values: list[str] = []
        for cell in row.findall("x:c", namespace):
            value = _extract_xlsx_cell_value(cell, shared_strings, namespace)
            if value:
                values.append(value)
        if values:
            rows.append(", ".join(values))
    return "\n".join(rows)


def _extract_xlsx_cell_value(cell: ElementTree.Element, shared_strings: list[str], namespace: dict[str, str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//x:t", namespace)).strip()

    value_node = cell.find("x:v", namespace)
    if value_node is None or value_node.text is None:
        return ""
    raw_value = value_node.text.strip()
    if cell_type == "s":
        try:
            return shared_strings[int(raw_value)].strip()
        except (IndexError, ValueError):
            return ""
    return raw_value


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


def _replace_knowledge_files(gpt: GPT, files: list[dict[str, str]]) -> None:
    gpt.knowledge_chunks.clear()
    gpt.knowledge_files.clear()
    for item in files:
        knowledge_file = KnowledgeFile(
            name=item.get("name", "").strip(),
            content=item.get("content", ""),
        )
        gpt.knowledge_files.append(knowledge_file)
        for index, chunk in enumerate(chunk_knowledge_text(knowledge_file.content)):
            knowledge_file.chunks.append(
                KnowledgeChunk(
                    gpt=gpt,
                    chunk_index=index,
                    content=chunk,
                    char_count=len(chunk),
                )
            )


def _migrate_legacy_knowledge_payload(db: Session | None, gpt: GPT) -> None:
    parsed = parse_knowledge_payload(gpt.knowledge or "")
    if not parsed:
        return
    notes, files = parsed
    if not gpt.knowledge_files and files:
        _replace_knowledge_files(gpt, files)
    gpt.knowledge = notes
    if db is not None:
        db.add(gpt)
        db.commit()
        db.refresh(gpt)


def chunk_knowledge_text(text: str) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", text or "").strip()
    if not normalized:
        return []

    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n+", normalized) if paragraph.strip()]
    if len(paragraphs) <= 1:
        return _fixed_size_chunks(normalized)

    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > CHUNK_MAX_CHARS:
            if current:
                chunks.append(current.strip())
                current = ""
            chunks.extend(_fixed_size_chunks(paragraph))
            continue

        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= CHUNK_MAX_CHARS:
            current = candidate
            continue

        if current:
            chunks.append(current.strip())
        overlap = current[-CHUNK_OVERLAP_CHARS:].strip() if current else ""
        current = f"{overlap}\n\n{paragraph}".strip() if overlap else paragraph

    if current:
        chunks.append(current.strip())
    return chunks


def _fixed_size_chunks(text: str) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_TARGET_CHARS, len(text))
        if end < len(text):
            boundary = max(text.rfind("\n", start, end), text.rfind(" ", start, end))
            if boundary > start + 400:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP_CHARS, start + 1)
    return chunks


def _tokenize(text: str) -> set[str]:
    return {token.lower() for token in TOKEN_RE.findall(text or "") if token.lower() not in STOPWORDS}


def _score_chunk(content: str, query_tokens: set[str], query_text: str) -> float:
    content_lower = content.lower()
    content_tokens = _tokenize(content)
    overlap = query_tokens & content_tokens
    if not overlap:
        return 0

    score = float(len(overlap) * 4)
    score += sum(2 for token in overlap if token in content_lower)
    query_lower = re.sub(r"\s+", " ", query_text.lower()).strip()
    if len(query_lower) >= 12 and query_lower in re.sub(r"\s+", " ", content_lower):
        score += 20
    score += min(len(overlap) / max(len(query_tokens), 1), 1) * 8
    return score
