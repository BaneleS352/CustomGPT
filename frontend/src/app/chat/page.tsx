"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Menu, Moon, Plus, Send, Square, Sun, Trash2 } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { api, streamMessage } from "@/lib/api";
import type { Chat, GPT, Message } from "@/lib/types";

type DraftMessage = Pick<Message, "role" | "content"> & { id: number; chat_id: number; created_at: string };

const starters = ["Draft a launch checklist", "Explain this GPT's strengths", "Write a concise plan", "Create a test prompt"];

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
    Promise.all([api.listGpts(true), api.listChats()]).then(([nextGpts, nextChats]) => {
      setGpts(nextGpts);
      setChats(nextChats);
      const param = Number(new URLSearchParams(window.location.search).get("gpt"));
      const selected = nextGpts.find((g) => g.id === param) || nextGpts[0];
      setActiveGptId(selected?.id || null);
      const existing = nextChats.find((chat) => chat.gpt_id === selected?.id);
      if (existing) api.getChat(existing.id).then(setActiveChat);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const activeGpt = useMemo(() => gpts.find((g) => g.id === activeGptId) || null, [gpts, activeGptId]);
  const filteredChats = chats.filter((chat) => chat.gpt_id === activeGptId);

  async function refreshChats() {
    const next = await api.listChats();
    setChats(next);
    return next;
  }

  async function newChat(gptId = activeGptId) {
    if (!gptId) return;
    const chat = await api.createChat(gptId);
    setActiveChat(chat);
    await refreshChats();
  }

  async function selectGpt(id: number) {
    setActiveGptId(id);
    const existing = chats.find((chat) => chat.gpt_id === id);
    setActiveChat(existing ? await api.getChat(existing.id) : null);
  }

  async function selectChat(chat: Chat) {
    setActiveGptId(chat.gpt_id);
    setActiveChat(await api.getChat(chat.id));
  }

  async function send(text = input) {
    if (!text.trim() || streaming || !activeGptId) return;
    setError("");
    let chat = activeChat;
    if (!chat) chat = await api.createChat(activeGptId);
    setInput("");
    const now = new Date().toISOString();
    const userMessage: DraftMessage = { id: Date.now(), chat_id: chat.id, role: "user", content: text, created_at: now };
    const assistantMessage: DraftMessage = { id: Date.now() + 1, chat_id: chat.id, role: "assistant", content: "", created_at: now };
    setActiveChat({ ...chat, messages: [...chat.messages, userMessage, assistantMessage] });
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamMessage(chat.id, text, (delta) => {
        setActiveChat((current) => current ? { ...current, messages: current.messages.map((m) => m.id === assistantMessage.id ? { ...m, content: m.content + delta } : m) } : current);
      }, controller.signal);
      const saved = await api.getChat(chat.id);
      setActiveChat(saved);
      await refreshChats();
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Message failed");
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

  return <div className="min-h-screen bg-white dark:bg-zinc-950"><TopNav section="chat" /><div className="flex h-[calc(100vh-73px)] overflow-hidden"><aside className={`${sidebarOpen ? "w-72" : "w-0"} shrink-0 overflow-hidden border-r border-zinc-200 bg-zinc-50 transition-all dark:border-zinc-800 dark:bg-zinc-950`}><div className="flex h-full flex-col gap-4 p-3"><button className="icon-button primary w-full justify-center" onClick={() => newChat()}><Plus size={16} />New Chat</button><div><div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Available GPTs</div><div className="space-y-1">{gpts.map((gpt) => <button key={gpt.id} className={`w-full rounded-md px-3 py-2 text-left text-sm ${gpt.id === activeGptId ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "hover:bg-zinc-200 dark:hover:bg-zinc-900"}`} onClick={() => selectGpt(gpt.id)}>{gpt.avatar} {gpt.name}</button>)}</div></div><div className="min-h-0 flex-1"><div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Shared Chat History</div><div className="space-y-1 overflow-auto">{filteredChats.map((chat) => <div key={chat.id} className={`group flex items-center gap-1 rounded-md ${chat.id === activeChat?.id ? "bg-zinc-200 dark:bg-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}><button className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm" onClick={() => selectChat(chat)}>{chat.title}</button><button title="Delete" className="p-2 text-zinc-500 hover:text-red-600" onClick={() => deleteConversation(chat)}><Trash2 size={15} /></button></div>)}</div></div></div></aside><main className="flex min-w-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"><div className="flex min-w-0 items-center gap-3"><button className="square-button" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={18} /></button><div className="min-w-0"><div className="truncate font-semibold">{activeGpt?.name || "No enabled GPT"}</div><div className="truncate text-xs text-zinc-500">{activeGpt?.description || "Create and enable a GPT in Admin View."}</div></div></div><button className="square-button" onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button></div>{error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}<div className="flex-1 overflow-auto p-4"><div className="mx-auto max-w-3xl space-y-5">{!activeChat?.messages.length && <div className="py-16 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-teal-600 font-semibold text-white">{activeGpt?.avatar || "AI"}</div><h1 className="text-2xl font-semibold">{activeGpt ? `Chat with ${activeGpt.name}` : "No GPT available"}</h1><p className="mt-2 text-sm text-zinc-500">All chats are shared locally in this MVP.</p><div className="mt-6 grid gap-2 sm:grid-cols-2">{starters.map((starter) => <button key={starter} disabled={!activeGpt} className="rounded-md border border-zinc-200 p-3 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900" onClick={() => send(starter)}>{starter}</button>)}</div></div>}{activeChat?.messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-md px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"}`}>{message.role === "assistant" ? <><ReactMarkdown components={{ code: ({ children }) => <code className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{children}</code>, pre: ({ children }) => <pre className="my-3 overflow-auto rounded-md bg-zinc-950 p-3 text-zinc-50">{children}</pre> }}>{message.content || "Thinking..."}</ReactMarkdown>{message.content && <button className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => navigator.clipboard.writeText(message.content)}><Copy size={13} />Copy</button>}</> : message.content}</div></div>)}</div></div><form className="border-t border-zinc-200 p-4 dark:border-zinc-800" onSubmit={(e) => { e.preventDefault(); send(); }}><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"><textarea className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" placeholder="Message the selected GPT" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />{streaming ? <button type="button" className="square-button" onClick={() => abortRef.current?.abort()}><Square size={17} /></button> : <button className="square-button primary" disabled={!activeGpt || !input.trim()}><Send size={17} /></button>}</div></form></main></div></div>;
}
