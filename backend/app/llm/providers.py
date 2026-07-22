import json
import os
import time
import urllib.error
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


class AnthropicProvider(StaticProvider):
    provider_name = "anthropic"


class GeminiProvider(StaticProvider):
    provider_name = "gemini"


class OllamaProvider(StaticProvider):
    provider_name = "ollama"


def get_provider_adapter(provider_config) -> LLMProvider:
    adapters = {
        "openai": OpenAICompatibleProvider,
        "anthropic": AnthropicProvider,
        "gemini": GeminiProvider,
        "ollama": OllamaProvider,
    }
    return adapters.get(provider_config.kind, OpenAICompatibleProvider)(provider_config)
