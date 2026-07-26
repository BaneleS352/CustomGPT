import type { Chat, GPT, Provider } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  apiUrl: API_URL,
  listGpts: (enabledOnly = false) =>
    json<GPT[]>(`/gpts${enabledOnly ? "?enabled_only=true" : ""}`),
  getGpt: (id: number) => json<GPT>(`/gpts/${id}`),
  createGpt: (payload: Partial<GPT>) =>
    json<GPT>("/gpts", { method: "POST", body: JSON.stringify(payload) }),
  updateGpt: (id: number, payload: Partial<GPT>) =>
    json<GPT>(`/gpts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteGpt: (id: number) =>
    json<{ ok: boolean }>(`/gpts/${id}`, { method: "DELETE" }),
  uploadKnowledgeFiles: async (files: File[]) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const payload = {
        files: await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            content_base64: arrayBufferToBase64(await file.arrayBuffer()),
          })),
        ),
      };
      const res = await fetch(`${API_URL}/gpts/knowledge-files/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res
          .json()
          .catch(() => ({ detail: res.statusText }));
        throw new Error(payload.detail || "Knowledge upload failed");
      }
      return res.json() as Promise<{
        files: Array<{ name: string; content: string }>;
      }>;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "Knowledge upload timed out. Check that the backend is running and try again.",
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  },
  listProviders: () => json<Provider[]>("/providers"),
  createProvider: (payload: Partial<Provider>) =>
    json<Provider>("/providers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProvider: (id: number, payload: Partial<Provider>) =>
    json<Provider>(`/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteProvider: (id: number) =>
    json<{ ok: boolean }>(`/providers/${id}`, { method: "DELETE" }),
  testProvider: (id: number) =>
    json<{ ok: boolean; message: string; models: string[] }>(
      `/providers/${id}/test`,
      { method: "POST" },
    ),
  listChats: () => json<Chat[]>("/chats"),
  getChat: (id: number) => json<Chat>(`/chats/${id}`),
  createChat: (gptId: number) =>
    json<Chat>("/chats", {
      method: "POST",
      body: JSON.stringify({ gpt_id: gptId, title: "New chat" }),
    }),
  deleteChat: (id: number) =>
    json<{ ok: boolean }>(`/chats/${id}`, { method: "DELETE" }),
};

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function streamMessage(
  chatId: number,
  content: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${API_URL}/chats/${chatId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok || !res.body)
    throw new Error(
      (await res.json().catch(() => null))?.detail || "Streaming failed",
    );
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const event = part
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(7);
      const dataLine = part
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (event === "delta" && dataLine)
        onDelta(JSON.parse(dataLine.slice(6)).content || "");
      if (event === "error" && dataLine)
        throw new Error(
          JSON.parse(dataLine.slice(6)).error || "Provider error",
        );
    }
  }
}
