import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold">Custom GPT MVP</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">A ChatGPT-style local workspace where every tester can chat and manage GPTs. There are no roles, login screens, or access gates.</p>
        <div className="mt-6 flex gap-3">
          <Link className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-950" href="/chat">Start Chatting</Link>
          <Link className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700" href="/admin">Manage GPTs</Link>
        </div>
      </div>
    </main>
  );
}
