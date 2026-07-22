"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { GPT, Provider } from "@/lib/types";

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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.listProviders().then(setProviders).catch((error) => setStatus(error.message));
  }, []);

  function set<K extends keyof GPT>(key: K, value: GPT[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setStatus("Saving...");
    try {
      const provider = providers.find((p) => p.id === Number(form.provider_id));
      const payload = { ...form, provider_id: form.provider_id ? Number(form.provider_id) : null, model_id: form.model_id || provider?.default_model || "" };
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
    <div className="grid min-h-[calc(100vh-73px)] gap-0 bg-zinc-50 lg:grid-cols-[minmax(360px,520px)_1fr] dark:bg-zinc-950">
      <section className="border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">GPT Builder</h1>
            <p className="text-sm text-zinc-500">Configure an assistant. Access is unrestricted.</p>
          </div>
          <button onClick={submit} className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-950"><Save size={16} />Save</button>
        </div>
        <div className="space-y-3">
          <input className="field" placeholder="Name" value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
          <textarea className="field min-h-20" placeholder="Description" value={form.description || ""} onChange={(e) => set("description", e.target.value)} />
          <input className="field" placeholder="Avatar or icon" value={form.avatar || ""} onChange={(e) => set("avatar", e.target.value)} />
          <textarea className="field min-h-36" placeholder="Instructions" value={form.instructions || ""} onChange={(e) => set("instructions", e.target.value)} />
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"><Upload size={16} />Upload md, docx, csv, or pdf knowledge files<input className="hidden" type="file" multiple accept=".md,.docx,.csv,.pdf" onChange={(e) => readFiles(e.target.files)} /></label>
          <textarea className="field min-h-28" placeholder="Knowledge text" value={form.knowledge || ""} onChange={(e) => set("knowledge", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className="field" value={form.provider_id || ""} onChange={(e) => set("provider_id", (e.target.value ? Number(e.target.value) : null) as GPT["provider_id"])}><option value="">Provider</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input className="field" placeholder="Model ID" value={form.model_id || ""} onChange={(e) => set("model_id", e.target.value)} />
            <input className="field" type="number" step="0.1" min="0" max="2" value={form.temperature ?? 0.7} onChange={(e) => set("temperature", Number(e.target.value))} />
            <input className="field" type="number" min="64" value={form.max_output_tokens ?? 800} onChange={(e) => set("max_output_tokens", Number(e.target.value))} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled ?? true} onChange={(e) => set("enabled", e.target.checked)} />Enabled in User View</label>
          <div className="flex items-center justify-between text-sm text-zinc-500"><span>{status}</span><Link className="underline" href="/chat">Open User View</Link></div>
        </div>
      </section>
      <section className="flex flex-col p-4">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-600 text-sm font-semibold text-white">{form.avatar || "AI"}</div><div><div className="font-semibold">{form.name || "Untitled GPT"}</div><div className="text-sm text-zinc-500">{form.description || "Preview description"}</div></div></div></div>
          <div className="flex-1 space-y-4 p-4 text-sm"><div className="max-w-[80%] rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">Try the GPT from here once saved.</div><div className="ml-auto max-w-[80%] rounded-md bg-zinc-900 p-3 text-white dark:bg-zinc-100 dark:text-zinc-950">How should this assistant behave?</div><div className="max-w-[80%] rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">{form.instructions || "Assistant behavior preview will reflect your instructions."}</div></div>
        </div>
      </section>
    </div>
  );
}
