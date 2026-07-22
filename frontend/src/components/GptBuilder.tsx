"use client";

import { useState } from "react";
import Link from "next/link";
import { Save, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { GPT } from "@/lib/types";

const empty: Partial<GPT> = {
  name: "",
  description: "",
  avatar: "AI",
  instructions: "",
  knowledge: "",
  enabled: true,
  provider_id: null,
  model_id: "",
  temperature: 0.7,
  max_output_tokens: 800,
};

export function GptBuilder({ initial }: { initial?: GPT }) {
  const [form, setForm] = useState<Partial<GPT>>(initial || empty);
  const [status, setStatus] = useState("");

  function set<K extends keyof GPT>(key: K, value: GPT[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setStatus("Saving...");
    try {
      const payload = {
        ...form,
        provider_id: null,
        model_id: form.model_id || "",
      };
      const saved = initial ? await api.updateGpt(initial.id, payload) : await api.createGpt(payload);
      setForm(saved);
      setStatus("Saved.");
      if (!initial) window.history.replaceState(null, "", `/admin/gpts/${saved.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function readFiles(files: FileList | null) {
    if (!files) return;
    const names = Array.from(files).map((f) => f.name).join(", ");
    const text = await Promise.all(Array.from(files).map(async (file) => `\n\n# ${file.name}\n${await file.text().catch(() => "Binary file noted; parsing is out of scope for this MVP.")}`));
    set("knowledge", `${form.knowledge || ""}${text.join("")}` as GPT["knowledge"]);
    setStatus(`Attached locally: ${names}`);
  }

  return (
    <section className="border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">GPT Builder</h1>
          <p className="text-sm text-zinc-500">Configure an assistant. Everyone can manage GPTs.</p>
        </div>
        <button onClick={submit} className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-950"><Save size={16} />Save</button>
      </div>
      <div className="space-y-3">
        <input className="field" placeholder="Name" value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
        <textarea className="field min-h-20" placeholder="Description" value={form.description || ""} onChange={(e) => set("description", e.target.value)} />
        <textarea className="field min-h-36" placeholder="Instructions" value={form.instructions || ""} onChange={(e) => set("instructions", e.target.value)} />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"><Upload size={16} />Upload md, docx, csv, or pdf knowledge files<input className="hidden" type="file" multiple accept=".md,.docx,.csv,.pdf" onChange={(e) => readFiles(e.target.files)} /></label>
        <textarea className="field min-h-28" placeholder="Knowledge text" value={form.knowledge || ""} onChange={(e) => set("knowledge", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className="field" placeholder="Model ID" value={form.model_id || ""} onChange={(e) => set("model_id", e.target.value)} />
          <input className="field" type="number" step="0.1" min="0" max="2" value={form.temperature ?? 0.7} onChange={(e) => set("temperature", Number(e.target.value))} />
          <input className="field" type="number" min="64" value={form.max_output_tokens ?? 800} onChange={(e) => set("max_output_tokens", Number(e.target.value))} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled ?? true} onChange={(e) => set("enabled", e.target.checked)} />Enabled in Chat</label>
        <div className="flex items-center justify-between text-sm text-zinc-500"><span>{status}</span><Link className="underline" href="/chat">Open Chat</Link></div>
      </div>
    </section>
  );
}
