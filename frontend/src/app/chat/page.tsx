"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Boxes,
  Copy,
  Menu,
  Moon,
  PanelLeft,
  PencilLine,
  Plus,
  Search,
  Send,
  Square,
  Sun,
  Trash2,
} from "lucide-react";
import { api, streamMessage } from "@/lib/api";
import type { Chat, GPT, Message } from "@/lib/types";

type DraftMessage = Pick<Message, "role" | "content"> & {
  id: number;
  chat_id: number;
  created_at: string;
};

export default function ChatPage() {
  const [gpts, setGpts] = useState<GPT[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeGptId, setActiveGptId] = useState<number | null>(null);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dark, setDark] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    Promise.all([api.listGpts(true), api.listChats()])
      .then(([nextGpts, nextChats]) => {
        setGpts(nextGpts);
        setChats(nextChats);
        const param = Number(new URLSearchParams(window.location.search).get("gpt"));
        const selected = nextGpts.find((gpt) => gpt.id === param) || null;
        setActiveGptId(selected?.id || null);
        const existing = selected ? nextChats.find((chat) => chat.gpt_id === selected.id) : null;
        if (existing) api.getChat(existing.id).then(setActiveChat);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const activeGpt = useMemo(() => gpts.find((gpt) => gpt.id === activeGptId) || null, [gpts, activeGptId]);
  const messages = activeChat?.messages || [];
  const hasMessages = messages.length > 0;

  async function refreshChats() {
    const next = await api.listChats();
    setChats(next);
    return next;
  }

  function startNewChat() {
    setActiveGptId(null);
    setActiveChat(null);
    setInput("");
    setError("");
  }

  async function selectChat(chat: Chat) {
    setActiveGptId(chat.gpt_id);
    setActiveChat(await api.getChat(chat.id));
  }

  async function send(text = input) {
    const prompt = text.trim();
    const gptId = activeGpt?.id || activeGptId;
    if (!prompt || streaming || !gptId) return;

    setError("");
    let chat = activeChat;
    if (!chat) chat = await api.createChat(gptId);

    setInput("");
    const now = new Date().toISOString();
    const userMessage: DraftMessage = {
      id: Date.now(),
      chat_id: chat.id,
      role: "user",
      content: prompt,
      created_at: now,
    };
    const assistantMessage: DraftMessage = {
      id: Date.now() + 1,
      chat_id: chat.id,
      role: "assistant",
      content: "",
      created_at: now,
    };

    setActiveChat({ ...chat, messages: [...chat.messages, userMessage, assistantMessage] });
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamMessage(
        chat.id,
        prompt,
        (delta) => {
          setActiveChat((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === assistantMessage.id
                      ? { ...message, content: message.content + delta }
                      : message,
                  ),
                }
              : current,
          );
        },
        controller.signal,
      );
      const saved = await api.getChat(chat.id);
      setActiveChat(saved);
      await refreshChats();
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "Message failed");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function deleteConversation(chat: Chat) {
    await api.deleteChat(chat.id);
    if (activeChat?.id === chat.id) setActiveChat(null);
    await refreshChats();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <aside
        className={`${sidebarOpen ? "w-[318px]" : "w-0"} shrink-0 overflow-hidden border-r border-zinc-200 bg-[#f7f7f7] transition-all dark:border-zinc-800 dark:bg-zinc-900`}
      >
        <div className="flex h-full flex-col px-3 py-4">
          <div className="mb-7 flex items-center justify-between px-1">
            <div className="text-2xl font-semibold tracking-normal">CustomGPT</div>
            <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
              <button title="Search" className="rounded-md p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800">
                <Search size={21} strokeWidth={1.8} />
              </button>
              <button
                title="Collapse sidebar"
                className="rounded-md p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft size={21} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <nav className="space-y-1 text-[15px]">
            <button
              className="flex h-11 w-full items-center gap-3 rounded-xl bg-zinc-200/80 px-3 text-left dark:bg-zinc-800"
              onClick={startNewChat}
            >
              <PencilLine size={20} strokeWidth={1.8} />
              <span>New chat</span>
            </button>
            <Link
              className="flex h-11 items-center gap-3 rounded-xl px-3 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
              href="/admin"
            >
              <Boxes size={20} strokeWidth={1.8} />
              <span>GPTs</span>
            </Link>
          </nav>

          <section className="mt-8 min-h-0 flex-1">
            <h2 className="mb-3 px-3 text-base font-semibold">Recents</h2>
            <div className="space-y-1 overflow-y-auto pr-1">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-1 rounded-xl ${chat.id === activeChat?.id ? "bg-zinc-200/80 dark:bg-zinc-800" : "hover:bg-zinc-200/70 dark:hover:bg-zinc-800"}`}
                >
                  <button
                    className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-[15px]"
                    onClick={() => selectChat(chat)}
                  >
                    {chat.title}
                  </button>
                  <button
                    title="Delete chat"
                    className="mr-1 hidden rounded-md p-1.5 text-zinc-500 hover:text-red-600 group-hover:block"
                    onClick={() => deleteConversation(chat)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {!chats.length && <div className="px-3 text-sm text-zinc-500">No recent chats yet.</div>}
            </div>
          </section>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-950">
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          {!sidebarOpen && (
            <button
              title="Open sidebar"
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
          )}
        </div>
        <div className="absolute right-5 top-5 z-10 flex gap-2">
          <button
            title="Toggle theme"
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {error && <div className="mx-auto mt-5 w-full max-w-3xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {hasMessages && activeGpt && (
          <div className="border-b border-zinc-100 px-16 py-3 dark:border-zinc-900">
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 text-center">
              <GptAvatar gpt={activeGpt} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{activeGpt.name}</div>
                {activeGpt.description && (
                  <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{activeGpt.description}</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`flex min-h-0 flex-1 ${hasMessages ? "flex-col" : "items-center justify-center px-5 pb-28"}`}>
          {hasMessages ? (
            <div className="flex-1 overflow-y-auto px-5 pb-32 pt-10">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-3xl px-5 py-3 text-[15px] leading-7 ${
                        message.role === "user"
                          ? "bg-[#f4f4f4] text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-950 dark:text-zinc-50"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <>
                          <ReactMarkdown
                            components={{
                              code: ({ children }) => (
                                <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">
                                  {children}
                                </code>
                              ),
                              pre: ({ children }) => (
                                <pre className="my-3 overflow-auto rounded-xl bg-zinc-950 p-4 text-zinc-50">
                                  {children}
                                </pre>
                              ),
                            }}
                          >
                            {message.content || "Thinking..."}
                          </ReactMarkdown>
                          {message.content && (
                            <button
                              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                              onClick={() => navigator.clipboard.writeText(message.content)}
                            >
                              <Copy size={13} />Copy
                            </button>
                          )}
                        </>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-5xl text-center">
              {activeGpt ? (
                <GptIntro gpt={activeGpt} />
              ) : (
                <h1 className="mb-10 text-[30px] font-normal tracking-normal text-zinc-950 dark:text-zinc-50">
                  How can I help you today?
                </h1>
              )}
              <Composer
                input={input}
                setInput={setInput}
                streaming={streaming}
                activeGpt={activeGpt}
                onSend={() => send()}
                onStop={() => abortRef.current?.abort()}
              />
              {!activeGpt && <p className="mt-4 text-sm text-zinc-500">Create or enable a GPT from GPTs.</p>}
            </div>
          )}
        </div>

        {hasMessages && (
          <div className="absolute inset-x-0 bottom-0 bg-white px-5 pb-6 pt-4 dark:bg-zinc-950">
            <Composer
              input={input}
              setInput={setInput}
              streaming={streaming}
              activeGpt={activeGpt}
              onSend={() => send()}
              onStop={() => abortRef.current?.abort()}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function GptIntro({ gpt }: { gpt: GPT }) {
  return (
    <div className="mx-auto mb-14 max-w-2xl">
      <div className="flex justify-center">
        <GptAvatar gpt={gpt} />
      </div>
      <h1 className="mt-5 text-[30px] font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">{gpt.name}</h1>
      {gpt.description && (
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{gpt.description}</p>
      )}
      {gpt.provider?.name && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Powered by {gpt.provider.name}
          {gpt.model_id ? ` - ${gpt.model_id}` : ""}
        </p>
      )}
    </div>
  );
}

function GptAvatar({ gpt, size = "lg" }: { gpt: GPT; size?: "sm" | "lg" }) {
  const dimensions = size === "lg" ? "h-14 w-14 text-sm" : "h-9 w-9 text-[11px]";
  const label = (gpt.avatar || gpt.name || "AI").slice(0, 3).toUpperCase();

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-teal-600 font-semibold text-white shadow-sm ${dimensions}`}
    >
      {label}
    </div>
  );
}

function Composer({
  input,
  setInput,
  streaming,
  activeGpt,
  onSend,
  onStop,
}: {
  input: string;
  setInput: (value: string) => void;
  streaming: boolean;
  activeGpt: GPT | null;
  onSend: () => void;
  onStop: () => void;
}) {
  return (
    <form
      className="mx-auto flex min-h-[72px] w-full max-w-[960px] items-center gap-3 rounded-[32px] border border-zinc-200 bg-white px-5 py-3 shadow-[0_14px_55px_rgba(0,0,0,0.10)] dark:border-zinc-800 dark:bg-zinc-900"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <button type="button" title="Add" className="shrink-0 rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <Plus size={24} strokeWidth={1.8} />
      </button>
      <textarea
        className="min-h-9 flex-1 resize-none bg-transparent py-2 text-[18px] leading-7 outline-none placeholder:text-zinc-400"
        placeholder="Ask anything"
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      {streaming ? (
        <button type="button" title="Stop" className="shrink-0 rounded-full bg-black p-3 text-white" onClick={onStop}>
          <Square size={18} fill="currentColor" />
        </button>
      ) : (
        <button
          title="Send"
          className="shrink-0 rounded-full bg-black p-3 text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
          disabled={!activeGpt || !input.trim()}
        >
          <Send size={18} />
        </button>
      )}
    </form>
  );
}
