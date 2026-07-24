"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, FileText, Loader2, Save, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { GPT, KnowledgeFile } from "@/lib/types";

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

const SUPPORTED_KNOWLEDGE_EXTENSIONS = [".md", ".txt", ".docx", ".csv", ".pdf", ".xlsx"];
const SUPPORTED_KNOWLEDGE_LABEL = "MD, TXT, DOCX, CSV, PDF, or XLSX";

type KnowledgeFileItem = KnowledgeFile & {
  key: string;
  size?: number;
  status: "ready" | "uploading" | "error";
  error?: string;
};

export function GptBuilder({ initial }: { initial?: GPT }) {
  const router = useRouter();
  const [form, setForm] = useState<Partial<GPT>>(
    initial ? { ...initial, knowledge: initial.knowledge || "" } : empty,
  );
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFileItem[]>(
    (initial?.knowledge_files || []).map((file) => ({
      ...file,
      key: file.id ? `saved-${file.id}` : `saved-${file.name}-${file.content.length}`,
      status: "ready",
    })),
  );
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  function set<K extends keyof GPT>(key: K, value: GPT[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (knowledgeFiles.some((file) => file.status === "uploading")) {
      setStatus("Wait for knowledge files to finish uploading before saving.");
      return;
    }
    setStatus("Saving...");
    try {
      const payload = {
        ...form,
        knowledge: form.knowledge || "",
        knowledge_files: knowledgeFiles
          .filter((file) => file.status === "ready")
          .map((file) => ({
            name: file.name,
            content: file.content,
          })),
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
    const invalidFiles = uploadedFiles.filter((file) => !isSupportedKnowledgeFile(file.name));
    if (invalidFiles.length > 0) {
      setStatus(`Unsupported file type: ${invalidFiles.map((file) => file.name).join(", ")}. Please upload ${SUPPORTED_KNOWLEDGE_LABEL} files.`);
      onDone?.();
      return;
    }
    const pendingFiles = uploadedFiles.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      content: "",
      size: file.size,
      status: "uploading" as const,
    }));
    setKnowledgeFiles((current) => [...current, ...pendingFiles]);
    setUploading(true);
    setStatus("Uploading knowledge files...");
    try {
      const result = await api.uploadKnowledgeFiles(uploadedFiles);
      setKnowledgeFiles((current) =>
        current.map((file) => {
          const index = pendingFiles.findIndex((pending) => pending.key === file.key);
          if (index === -1) return file;
          const extracted = result.files[index];
          return extracted ? { ...file, ...extracted, status: "ready" } : file;
        }),
      );
      setStatus(`Attached locally: ${result.files.map((file) => file.name).join(", ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Knowledge upload failed";
      setKnowledgeFiles((current) =>
        current.map((file) =>
          pendingFiles.some((pending) => pending.key === file.key)
            ? { ...file, status: "error", error: message }
            : file,
        ),
      );
      setStatus(message);
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
        <label className={`flex items-center gap-2 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 ${uploading ? "cursor-wait opacity-70" : "cursor-pointer"}`}><Upload size={16} />{uploading ? "Uploading knowledge files..." : `Upload knowledge files (${SUPPORTED_KNOWLEDGE_LABEL})`}<input className="hidden" type="file" multiple accept={SUPPORTED_KNOWLEDGE_EXTENSIONS.join(",")} disabled={uploading} onChange={(e) => { const input = e.currentTarget; void readFiles(input.files, () => { input.value = ""; }); }} /></label>
        {knowledgeFiles.length > 0 && (
          <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {knowledgeFiles.map((file) => (
              <div key={file.key} className="flex items-center gap-3 rounded-md bg-white px-3 py-2 dark:bg-zinc-950">
                <FileText size={18} className="shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{file.name}</div>
                  <div className={`text-xs ${file.status === "error" ? "text-red-600" : "text-zinc-500"}`}>
                    {file.status === "ready" && `${file.size ? formatBytes(file.size) : "Saved"} - Ready`}
                    {file.status === "uploading" && `${file.size ? `${formatBytes(file.size)} - ` : ""}Extracting text...`}
                    {file.status === "error" && file.error}
                  </div>
                </div>
                {file.status === "ready" && <CheckCircle size={16} className="shrink-0 text-emerald-600" />}
                {file.status === "uploading" && <Loader2 size={16} className="shrink-0 animate-spin text-zinc-500" />}
                {file.status === "error" && <AlertCircle size={16} className="shrink-0 text-red-600" />}
                <button
                  type="button"
                  title="Remove file"
                  className="square-button h-8 w-8"
                  onClick={() => setKnowledgeFiles((current) => current.filter((item) => item.key !== file.key))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isSupportedKnowledgeFile(filename: string) {
  const lowerName = filename.toLowerCase();
  return SUPPORTED_KNOWLEDGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}
