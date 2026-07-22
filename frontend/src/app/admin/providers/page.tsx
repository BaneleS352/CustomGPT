"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Plus, Trash2 } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { api } from "@/lib/api";
import type { Provider, ProviderKind } from "@/lib/types";

const blank: Partial<Provider> = { name: "", kind: "openai", base_url: "", api_key_env: "", default_model: "", enabled: true };

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<Partial<Provider>>(blank);
  const [status, setStatus] = useState("");

  async function load() { setProviders(await api.listProviders()); }
  useEffect(() => { load().catch((e) => setStatus(e.message)); }, []);

  async function save(provider?: Provider) {
    try {
      setStatus("Saving...");
      if (provider) await api.updateProvider(provider.id, provider);
      else await api.createProvider(form);
      setForm(blank);
      await load();
      setStatus("Saved.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Save failed"); }
  }

  async function test(id: number) {
    const result = await api.testProvider(id);
    setStatus(`${result.ok ? "OK" : "Needs setup"}: ${result.message}`);
  }

  return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950"><TopNav section="gpts" /><main className="mx-auto max-w-5xl p-4"><div className="mb-5"><h1 className="text-2xl font-semibold">Provider Settings</h1><p className="text-sm text-zinc-500">API keys stay server-side via environment variable names.</p></div><div className="mb-4 grid gap-2 rounded-md border border-zinc-200 bg-white p-4 md:grid-cols-7 dark:border-zinc-800 dark:bg-zinc-900"><input className="field md:col-span-1" placeholder="Name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /><select className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderKind })}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="ollama">Ollama</option></select><input className="field md:col-span-2" placeholder="Base URL" value={form.base_url || ""} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /><input className="field" placeholder="API key env" value={form.api_key_env || ""} onChange={(e) => setForm({ ...form, api_key_env: e.target.value })} /><input className="field" placeholder="Default model" value={form.default_model || ""} onChange={(e) => setForm({ ...form, default_model: e.target.value })} /><button className="icon-button primary" onClick={() => save()}><Plus size={16} />Add</button></div><div className="space-y-3">{providers.map((p, index) => <div key={p.id} className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-7 dark:border-zinc-800 dark:bg-zinc-900"><input className="field" value={p.name} onChange={(e) => setProviders(providers.map((x, i) => i === index ? { ...x, name: e.target.value } : x))} /><select className="field" value={p.kind} onChange={(e) => setProviders(providers.map((x, i) => i === index ? { ...x, kind: e.target.value as ProviderKind } : x))}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="ollama">Ollama</option></select><input className="field md:col-span-2" value={p.base_url} onChange={(e) => setProviders(providers.map((x, i) => i === index ? { ...x, base_url: e.target.value } : x))} /><input className="field" value={p.api_key_env} onChange={(e) => setProviders(providers.map((x, i) => i === index ? { ...x, api_key_env: e.target.value } : x))} /><input className="field" value={p.default_model} onChange={(e) => setProviders(providers.map((x, i) => i === index ? { ...x, default_model: e.target.value } : x))} /><div className="flex gap-1"><button title="Save" className="square-button" onClick={() => save(p)}><CheckCircle size={16} /></button><button title="Test" className="square-button" onClick={() => test(p.id)}>T</button><button title="Delete" className="square-button danger" onClick={async () => { await api.deleteProvider(p.id); load(); }}><Trash2 size={16} /></button></div><label className="text-sm md:col-span-7"><input type="checkbox" checked={p.enabled} onChange={(e) => setProviders(providers.map((x, i) => i === index ? { ...x, enabled: e.target.checked } : x))} /> Enabled</label></div>)}</div><p className="mt-4 text-sm text-zinc-500">{status}</p></main></div>;
}


