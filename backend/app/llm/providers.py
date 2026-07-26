import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generator


@dataclass
class NormalizedMessage:
    role: str
    content: str


@dataclass
class NormalizedRequest:
    messages: list[NormalizedMessage]
    instructions: str
    model: str
    temperature: float
    max_output_tokens: int


@dataclass
class NormalizedResponse:
    content: str
    model: str
    provider: str
    mock: bool = False


@dataclass
class LLMError:
    message: str
    provider: str
    retryable: bool = False


@dataclass
class StreamEvent:
    type: str
    content: str = ""
    error: str = ""


def _iter_sse_data(response) -> Generator[str, None, None]:
    data_lines: list[str] = []
    for raw_line in response:
        line = raw_line.decode("utf-8").rstrip("\r\n")
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif not line.strip() and data_lines:
            yield "\n".join(data_lines)
            data_lines = []
    if data_lines:
        yield "\n".join(data_lines)


class LLMProvider(ABC):
    def __init__(self, provider_config):
        self.config = provider_config

    @abstractmethod
    def list_models(self) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def validate_configuration(self) -> tuple[bool, str]:
        raise NotImplementedError

    @abstractmethod
    def generate_response(self, request: NormalizedRequest) -> NormalizedResponse:
        raise NotImplementedError

    @abstractmethod
    def stream_response(self, request: NormalizedRequest) -> Generator[StreamEvent, None, None]:
        raise NotImplementedError

    @abstractmethod
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def _api_key(self) -> str:
        return os.getenv(self.config.api_key_env or "", "")

    def _mock_text(self, request: NormalizedRequest) -> str:
        last = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        name = getattr(self.config, "name", "Mock provider")
        return (
            f"Mock mode: {name} is not fully configured, so no external model was called.\n\n"
            f"I received: {last}\n\n"
            "Configure the provider API key environment variable to use live AI responses."
        )

    def _stream_text(self, text: str) -> Generator[StreamEvent, None, None]:
        for token in text.split(" "):
            yield StreamEvent(type="delta", content=token + " ")
            time.sleep(0.015)
        yield StreamEvent(type="done")


class OpenAICompatibleProvider(LLMProvider):
    def list_models(self) -> list[str]:
        model = self.config.default_model or "gpt-4o-mini"
        return [model]

    def validate_configuration(self) -> tuple[bool, str]:
        if not self._api_key():
            return False, f"Missing {self.config.api_key_env or 'API key environment variable'}"
        return True, "Configuration looks usable."

    def generate_response(self, request: NormalizedRequest) -> NormalizedResponse:
        return NormalizedResponse("".join(e.content for e in self.stream_response(request) if e.type == "delta"), request.model, "openai")

    def stream_response(self, request: NormalizedRequest) -> Generator[StreamEvent, None, None]:
        key = self._api_key()
        if not key:
            yield from self._stream_text(self._mock_text(request))
            return

        base_url = (self.config.base_url or "https://api.openai.com/v1").rstrip("/")
        payload = {
            "model": request.model or self.config.default_model,
            "messages": [
                {"role": "system", "content": request.instructions},
                *[{"role": m.role, "content": m.content} for m in request.messages],
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_output_tokens,
            "stream": True,
        }
        req = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8").strip()
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        yield StreamEvent(type="done")
                        return
                    chunk = json.loads(data)
                    delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        yield StreamEvent(type="delta", content=delta)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            yield StreamEvent(type="error", error=f"OpenAI-compatible request failed: {exc}")

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        key = self._api_key()
        if not key or not texts:
            return [[0.0] * 1536 for _ in texts]
        
        base_url = (self.config.base_url or "https://api.openai.com/v1").rstrip("/")
        payload = {
            "input": texts,
            "model": "text-embedding-3-small"
        }
        req = urllib.request.Request(
            f"{base_url}/embeddings",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode("utf-8"))
                data = result.get("data", [])
                data.sort(key=lambda x: x.get("index", 0))
                return [item.get("embedding", []) for item in data]
        except Exception:
            return [[0.0] * 1536 for _ in texts]


class StaticProvider(LLMProvider):
    provider_name = "provider"

    def list_models(self) -> list[str]:
        return [self.config.default_model or "default"]

    def validate_configuration(self) -> tuple[bool, str]:
        if self.config.kind != "ollama" and not self._api_key():
            return False, f"Missing {self.config.api_key_env or 'API key environment variable'}"
        return True, "Adapter configured for MVP mock streaming."

    def generate_response(self, request: NormalizedRequest) -> NormalizedResponse:
        return NormalizedResponse(self._mock_text(request), request.model, self.provider_name, mock=True)

    def stream_response(self, request: NormalizedRequest) -> Generator[StreamEvent, None, None]:
        yield from self._stream_text(self._mock_text(request))

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]


class AnthropicProvider(StaticProvider):
    provider_name = "anthropic"

    def _base_url(self) -> str:
        return (self.config.base_url or "https://api.anthropic.com/v1").rstrip("/")

    def _model(self, request: NormalizedRequest | None = None) -> str:
        if request and request.model:
            return request.model
        return self.config.default_model or "claude-3-5-haiku-latest"

    def list_models(self) -> list[str]:
        key = self._api_key()
        if not key:
            return [self._model()]

        req = urllib.request.Request(
            f"{self._base_url()}/models",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8"))
                names = [item.get("id", "") for item in result.get("data", []) if item.get("id")]
                return names or [self._model()]
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return [self._model()]

    def validate_configuration(self) -> tuple[bool, str]:
        if not self._api_key():
            return False, f"Missing {self.config.api_key_env or 'API key environment variable'}"
        return True, "Configuration looks usable."

    def generate_response(self, request: NormalizedRequest) -> NormalizedResponse:
        return NormalizedResponse(
            "".join(e.content for e in self.stream_response(request) if e.type == "delta"),
            self._model(request),
            self.provider_name,
        )

    def stream_response(self, request: NormalizedRequest) -> Generator[StreamEvent, None, None]:
        key = self._api_key()
        if not key:
            yield from self._stream_text(self._mock_text(request))
            return

        payload = {
            "model": self._model(request),
            "max_tokens": request.max_output_tokens,
            "temperature": request.temperature,
            "stream": True,
            "messages": [
                {"role": m.role, "content": m.content}
                for m in request.messages
                if m.role in {"user", "assistant"} and m.content
            ],
        }
        if request.instructions:
            payload["system"] = request.instructions

        req = urllib.request.Request(
            f"{self._base_url()}/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                for data in _iter_sse_data(response):
                    chunk = json.loads(data)
                    if chunk.get("type") == "content_block_delta":
                        text = chunk.get("delta", {}).get("text", "")
                        if text:
                            yield StreamEvent(type="delta", content=text)
                    elif chunk.get("type") == "error":
                        message = chunk.get("error", {}).get("message", "Unknown Anthropic error")
                        yield StreamEvent(type="error", error=f"Anthropic request failed: {message}")
                        return
                    elif chunk.get("type") == "message_stop":
                        yield StreamEvent(type="done")
                        return
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            yield StreamEvent(type="error", error=f"Anthropic request failed: {exc}")


class GeminiProvider(StaticProvider):
    provider_name = "gemini"

    def _base_url(self) -> str:
        return (self.config.base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

    def _model(self, request: NormalizedRequest | None = None) -> str:
        model = request.model if request and request.model else self.config.default_model
        return (model or "gemini-2.0-flash").removeprefix("models/")

    def _key_query(self) -> str:
        return urllib.parse.urlencode({"key": self._api_key()})

    def list_models(self) -> list[str]:
        if not self._api_key():
            return [self._model()]

        req = urllib.request.Request(f"{self._base_url()}/models?{self._key_query()}", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8"))
                names = []
                for model in result.get("models", []):
                    methods = model.get("supportedGenerationMethods", [])
                    name = model.get("name", "").removeprefix("models/")
                    if name and "generateContent" in methods:
                        names.append(name)
                return names or [self._model()]
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return [self._model()]

    def validate_configuration(self) -> tuple[bool, str]:
        if not self._api_key():
            return False, f"Missing {self.config.api_key_env or 'API key environment variable'}"
        return True, "Configuration looks usable."

    def generate_response(self, request: NormalizedRequest) -> NormalizedResponse:
        return NormalizedResponse(
            "".join(e.content for e in self.stream_response(request) if e.type == "delta"),
            self._model(request),
            self.provider_name,
        )

    def stream_response(self, request: NormalizedRequest) -> Generator[StreamEvent, None, None]:
        if not self._api_key():
            yield from self._stream_text(self._mock_text(request))
            return

        payload = {
            "contents": [
                {
                    "role": "model" if m.role == "assistant" else "user",
                    "parts": [{"text": m.content}],
                }
                for m in request.messages
                if m.role in {"user", "assistant"} and m.content
            ],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_output_tokens,
            },
        }
        if request.instructions:
            payload["systemInstruction"] = {
                "role": "user",
                "parts": [{"text": request.instructions}],
            }

        model = urllib.parse.quote(self._model(request), safe="")
        req = urllib.request.Request(
            f"{self._base_url()}/models/{model}:streamGenerateContent?{self._key_query()}&alt=sse",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                for data in _iter_sse_data(response):
                    chunk = json.loads(data)
                    for candidate in chunk.get("candidates", []):
                        for part in candidate.get("content", {}).get("parts", []):
                            text = part.get("text", "")
                            if text:
                                yield StreamEvent(type="delta", content=text)
                    if chunk.get("error"):
                        message = chunk.get("error", {}).get("message", "Unknown Gemini error")
                        yield StreamEvent(type="error", error=f"Gemini request failed: {message}")
                        return
            yield StreamEvent(type="done")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            yield StreamEvent(type="error", error=f"Gemini request failed: {exc}")


class OllamaProvider(StaticProvider):
    provider_name = "ollama"

    def _base_url(self) -> str:
        return (self.config.base_url or "http://localhost:11434").rstrip("/")

    def _model(self, request: NormalizedRequest | None = None) -> str:
        if request and request.model:
            return request.model
        return self.config.default_model or "llama3.1"

    def list_models(self) -> list[str]:
        req = urllib.request.Request(f"{self._base_url()}/api/tags", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))
                models = result.get("models", [])
                names = [model.get("name", "") for model in models if model.get("name")]
                return names or [self._model()]
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return [self._model()]

    def validate_configuration(self) -> tuple[bool, str]:
        req = urllib.request.Request(f"{self._base_url()}/api/tags", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10):
                return True, "Ollama is reachable."
        except (urllib.error.URLError, TimeoutError) as exc:
            return False, f"Ollama is not reachable at {self._base_url()}: {exc}"

    def generate_response(self, request: NormalizedRequest) -> NormalizedResponse:
        return NormalizedResponse(
            "".join(e.content for e in self.stream_response(request) if e.type == "delta"),
            self._model(request),
            self.provider_name,
        )

    def stream_response(self, request: NormalizedRequest) -> Generator[StreamEvent, None, None]:
        messages = []
        if request.instructions:
            messages.append({"role": "system", "content": request.instructions})
        messages.extend({"role": m.role, "content": m.content} for m in request.messages)

        payload = {
            "model": self._model(request),
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_output_tokens,
            },
        }
        req = urllib.request.Request(
            f"{self._base_url()}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8").strip()
                    if not line:
                        continue
                    chunk = json.loads(line)
                    if chunk.get("error"):
                        yield StreamEvent(type="error", error=f"Ollama request failed: {chunk['error']}")
                        return
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield StreamEvent(type="delta", content=content)
                    if chunk.get("done"):
                        yield StreamEvent(type="done")
                        return
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            yield StreamEvent(type="error", error=f"Ollama request failed: {exc}")

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
            
        payload = {
            "model": "nomic-embed-text",
            "prompt": texts[0]  # Ollama /api/embeddings expects a single prompt in older versions, but /api/embed takes list
        }
        # We will use /api/embed if possible, fallback to /api/embeddings
        embed_payload = {
            "model": "nomic-embed-text",
            "input": texts
        }
        req = urllib.request.Request(
            f"{self._base_url()}/api/embed",
            data=json.dumps(embed_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode("utf-8"))
                embeddings = result.get("embeddings", [])
                if embeddings:
                    return embeddings
        except Exception:
            pass
        return [[0.0] * 1536 for _ in texts]


def get_provider_adapter(provider_config) -> LLMProvider:
    adapters = {
        "openai": OpenAICompatibleProvider,
        "anthropic": AnthropicProvider,
        "gemini": GeminiProvider,
        "ollama": OllamaProvider,
    }
    return adapters.get(provider_config.kind, OpenAICompatibleProvider)(provider_config)
