import { TopNav } from "@/components/TopNav";
import { GptBuilder } from "@/components/GptBuilder";

export default function NewGptPage() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav section="gpts" />
      <GptBuilder />
    </div>
  );
}
