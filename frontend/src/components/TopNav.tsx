import Link from "next/link";

export function TopNav({ section }: { section: "admin" | "chat" }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <div className="font-semibold text-zinc-950 dark:text-zinc-50">Custom GPT MVP</div>
        <div className="text-xs text-amber-700 dark:text-amber-300">Unrestricted local MVP: no login or access control.</div>
      </div>
      <nav className="flex items-center gap-2">
        <Link className={`rounded-md px-3 py-2 ${section === "admin" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`} href="/admin">Admin</Link>
        <Link className={`rounded-md px-3 py-2 ${section === "chat" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`} href="/chat">User Chat</Link>
      </nav>
    </div>
  );
}
