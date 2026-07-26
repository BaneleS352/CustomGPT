import Link from "next/link";
import Image from "next/image";

export function TopNav({ section }: { section: "gpts" | "chat" }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 text-sm">
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/HollywoodGPT.png"
          alt="Hollywood GPT"
          width={180}
          height={48}
          className="h-11 w-auto object-contain"
        />
      </Link>
      <nav className="flex items-center gap-3 text-base font-medium">
        <Link
          className={`rounded-lg px-4 py-2.5 ${section === "chat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          href="/chat"
        >
          Chat
        </Link>
        <Link
          className={`rounded-lg px-4 py-2.5 ${section === "gpts" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          href="/admin"
        >
          GPTs
        </Link>
      </nav>
    </div>
  );
}
