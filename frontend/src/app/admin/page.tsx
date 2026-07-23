"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Edit, MessageSquare, Plus, Trash2 } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { api } from "@/lib/api";
import type { GPT } from "@/lib/types";

export default function AdminPage() {
  const [gpts, setGpts] = useState<GPT[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try { setGpts(await api.listGpts()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: number) {
    if (!confirm("Delete this GPT and its chats?")) return;
    await api.deleteGpt(id);
    load();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <TopNav section="gpts" />
      <main className="mx-auto max-w-6xl p-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">GPTs</h1><p className="text-sm text-zinc-500">Create and manage GPTs. Every local tester has full builder access.</p></div>
          <div className="flex gap-2"><Link className="icon-button primary" href="/admin/gpts/new"><Plus size={16} />New GPT</Link></div>
        </div>
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {gpts.map((gpt) => <div key={gpt.id} className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div className="mb-3 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-600 text-sm font-semibold text-white">{gpt.avatar}</div><div className="min-w-0"><h2 className="truncate font-semibold">{gpt.name}</h2><p className="line-clamp-2 text-sm text-zinc-500">{gpt.description || "No description"}</p></div></div><div className="mb-4 text-xs font-medium"><span className={`rounded-full px-2 py-1 ${gpt.enabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>{gpt.enabled ? "Enabled" : "Disabled"}</span></div><div className="flex flex-wrap gap-2"><Link className="small-action" href={`/admin/gpts/${gpt.id}`}><Edit size={15} />Edit</Link><Link className="small-action" href={`/chat?gpt=${gpt.id}`}><MessageSquare size={15} />Test</Link><button className="small-action danger" onClick={() => remove(gpt.id)}><Trash2 size={15} />Delete</button></div></div>)}
        </div>
        {!gpts.length && !error && <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">No GPTs yet.</div>}
      </main>
    </div>
  );
}

