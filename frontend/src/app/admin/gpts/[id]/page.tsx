"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { GptBuilder } from "@/components/GptBuilder";
import { api } from "@/lib/api";
import type { GPT } from "@/lib/types";

export default function EditGptPage() {
  const params = useParams<{ id: string }>();
  const [gpt, setGpt] = useState<GPT | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getGpt(Number(params.id))
      .then(setGpt)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );
  }, [params.id]);

  return (
    <div className="min-h-screen bg-background">
      <TopNav section="gpts" />
      {error ? (
        <main className="p-4 text-red-700">{error}</main>
      ) : gpt ? (
        <GptBuilder initial={gpt} />
      ) : (
        <main className="p-4 text-muted-foreground">Loading...</main>
      )}
    </div>
  );
}
