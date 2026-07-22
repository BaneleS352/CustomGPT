import Link from "next/link";

export function TopNav({ section }: { section: "gpts" | "chat" }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="font-semibold text-zinc-950 dark:text-zinc-50">CustomGPT</div>
      <nav className="flex items-center gap-3 text-base font-medium">
        <Link className={`rounded-lg px-4 py-2.5 ${section === "chat" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`} href="/chat">Chat</Link>
        <Link className={`rounded-lg px-4 py-2.5 ${section === "gpts" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`} href="/admin">GPTs</Link>
      </nav>
    </div>
  );
}

