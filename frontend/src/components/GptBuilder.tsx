"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

const KNOWLEDGE_PREFIX = "<<<CUSTOMGPT_KNOWLEDGE_V1>>>";
const KNOWLEDGE_SUFFIX = "<<<END_CUSTOMGPT_KNOWLEDGE_V1>>>";

type KnowledgeFile = {
  name: string;
  content: string;
};

function parseKnowledge(value: string | undefined) {
  const knowledge = value || "";
  if (!knowledge.startsWith(KNOWLEDGE_PREFIX) || !knowledge.endsWith(KNOWLEDGE_SUFFIX)) {
    return { notes: knowledge, files: [] as KnowledgeFile[] };
  }
  const body = knowledge.slice(KNOWLEDGE_PREFIX.length, knowledge.lastIndexOf(KNOWLEDGE_SUFFIX)).trim();
  try {
    const parsed = JSON.parse(body) as { notes?: string; files?: KnowledgeFile[] };
    return {
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      files: Array.isArray(parsed.files)
        ? parsed.files.filter((item) => item && typeof item.name === "string" && typeof item.content === "string")
        : [],
    };
  } catch {
    return { notes: knowledge, files: [] as KnowledgeFile[] };
  }
}

function serializeKnowledge(notes: string, files: KnowledgeFile[]) {
  return `${KNOWLEDGE_PREFIX}\n${JSON.stringify({ notes, files })}\n${KNOWLEDGE_SUFFIX}`;
}

export function GptBuilder({ initial }: { initial?: GPT }) {
  const router = useRouter();
  const initialKnowledge = parseKnowledge(initial?.knowledge);
  const [form, setForm] = useState<Partial<GPT>>(
    initial ? { ...initial, knowledge: initialKnowledge.notes } : empty,
  );
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>(initialKnowledge.files);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  function set<K extends keyof GPT>(key: K, value: GPT[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setStatus("Saving...");
    try {
      const payload = {
        ...form,
        knowledge: serializeKnowledge(form.knowledge || "", knowledgeFiles),
        provider_id: null,
        model_id: form.model_id || "",
      };
      await (initial ? api.updateGpt(initial.id, payload) : api.createGpt(payload));
      setStatus("Saved.");
      router.push("/admin");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function readFiles(files: FileList | null, onDone?: () => void) {
    if (!files) return;
    const uploadedFiles = Array.from(files);
    if (uploadedFiles.length === 0) return;
    setUploading(true);
    setStatus("Uploading knowledge files...");
    try {
      const result = await api.uploadKnowledgeFiles(uploadedFiles);
      setKnowledgeFiles((current) => [...current, ...result.files]);
      setStatus(`Attached locally: ${result.files.map((file) => file.name).join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Knowledge upload failed");
    } finally {
      setUploading(false);
      onDone?.();
    }
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
        <label className={`flex items-center gap-2 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 ${uploading ? "cursor-wait opacity-70" : "cursor-pointer"}`}><Upload size={16} />{uploading ? "Uploading knowledge files..." : "Upload md, docx, csv, or pdf knowledge files"}<input className="hidden" type="file" multiple accept=".md,.docx,.csv,.pdf" disabled={uploading} onChange={(e) => readFiles(e.target.files, () => { e.currentTarget.value = ""; })} /></label>
        {knowledgeFiles.length > 0 && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {knowledgeFiles.map((file) => (
              <div key={`${file.name}-${file.content.length}`}>{file.name}</div>
            ))}
          </div>
        )}
        <textarea className="field min-h-28" placeholder="Knowledge notes" value={form.knowledge || ""} onChange={(e) => set("knowledge", e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled ?? true} onChange={(e) => set("enabled", e.target.checked)} />Enabled in Chat</label>
        <div className="flex items-center justify-between text-sm text-zinc-500"><span>{status}</span><Link className="underline" href="/chat">Open Chat</Link></div>
      </div>
    </section>
  );
}
