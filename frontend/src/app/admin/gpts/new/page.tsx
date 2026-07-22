import { TopNav } from "@/components/TopNav";
import { GptBuilder } from "@/components/GptBuilder";

export default function NewGptPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <TopNav section="gpts" />
      <GptBuilder />
    </div>
  );
}
