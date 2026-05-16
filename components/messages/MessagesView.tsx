'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { Thread } from '@/lib/drive/messages';
import type { Role } from '@/lib/auth/session';

interface Props {
  role: Role;
  selfEmail: string;
  initialThreads: Thread[];
  /** Investor emails the admin can start a thread with. Empty for investors. */
  investorChoices?: { email: string; name: string }[];
}

export function MessagesView({ role, selfEmail, initialThreads, investorChoices = [] }: Props) {
  const [threads, setThreads] = useState(initialThreads);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp.get('thread');
  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) || threads[0],
    [threads, selectedId]
  );

  async function refresh() {
    const res = await fetch('/api/messages', { cache: 'no-store' });
    const data = await res.json();
    if (data.ok) setThreads(data.threads);
  }

  useEffect(() => {
    if (!selected) return;
    const unread = selected.messages.some((m) =>
      role === 'admin' ? !m.readByAdmin : !m.readByInvestor
    );
    if (!unread) return;
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-read', threadId: selected.id }),
    }).then(refresh);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reply(threadId: string, body: string) {
    setBusy(true);
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reply', threadId, body }),
    });
    await refresh();
    setBusy(false);
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <aside className="md:col-span-1">
        {role === 'admin' ? (
          <NewThreadForm
            investorChoices={investorChoices}
            onCreated={(thread) => {
              setThreads((cur) => [thread, ...cur]);
              router.push(`?thread=${thread.id}`);
            }}
          />
        ) : null}
        <ul className="mt-4 overflow-hidden rounded-xl border border-brand-line bg-white">
          {threads.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-brand-muted">
              No threads yet.
            </li>
          ) : (
            threads.map((t) => {
              const last = t.messages[t.messages.length - 1];
              const unread = t.messages.some((m) =>
                role === 'admin' ? !m.readByAdmin : !m.readByInvestor
              );
              return (
                <li key={t.id} className="border-b border-brand-line last:border-0">
                  <button
                    type="button"
                    onClick={() => router.push(`?thread=${t.id}`)}
                    className={`block w-full px-4 py-3 text-left text-sm ${
                      selected?.id === t.id ? 'bg-brand-bg/60' : 'hover:bg-brand-bg/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-brand-fg">{t.subject}</p>
                      {unread ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-brand-accent" />
                      ) : null}
                    </div>
                    {role === 'admin' ? (
                      <p className="truncate text-xs text-brand-muted">{t.investorEmail}</p>
                    ) : null}
                    {last ? (
                      <p className="mt-1 truncate text-xs text-brand-muted">{last.body}</p>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <section className="md:col-span-2">
        {selected ? (
          <ThreadView
            thread={selected}
            selfEmail={selfEmail}
            onReply={(body) => reply(selected.id, body)}
            busy={busy}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-brand-line bg-white px-5 py-12 text-center text-sm text-brand-muted">
            Select a thread to read messages.
          </p>
        )}
      </section>
    </div>
  );
}

function ThreadView({
  thread,
  selfEmail,
  onReply,
  busy,
}: {
  thread: Thread;
  selfEmail: string;
  onReply: (body: string) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState('');
  return (
    <article className="overflow-hidden rounded-xl border border-brand-line bg-white">
      <header className="border-b border-brand-line px-5 py-3">
        <h2 className="font-display text-lg text-brand-fg">{thread.subject}</h2>
        <p className="text-xs text-brand-muted">With {thread.investorEmail}</p>
      </header>
      <ol className="space-y-4 px-5 py-4">
        {thread.messages.map((m) => {
          const mine = m.fromEmail.toLowerCase() === selfEmail.toLowerCase();
          return (
            <li
              key={m.id}
              className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                mine
                  ? 'ml-auto bg-brand-accent/10 text-brand-fg'
                  : 'bg-brand-bg/60 text-brand-fg'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-brand-muted">
                {m.fromEmail} · {new Date(m.sentAt).toLocaleString()}
              </p>
            </li>
          );
        })}
      </ol>
      <footer className="border-t border-brand-line bg-brand-bg/30 px-5 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={8000}
          placeholder="Write a reply…"
          className="w-full rounded-md border border-brand-line bg-white px-3 py-2 text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button
            disabled={busy || !draft.trim()}
            onClick={() => {
              onReply(draft.trim());
              setDraft('');
            }}
          >
            {busy ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </footer>
    </article>
  );
}

function NewThreadForm({
  investorChoices,
  onCreated,
}: {
  investorChoices: { email: string; name: string }[];
  onCreated: (thread: Thread) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)}>
        New thread
      </Button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            investorEmail: fd.get('investorEmail'),
            subject: fd.get('subject'),
            body: fd.get('body'),
          }),
        });
        const data = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok || !data.ok) {
          setError(data.message || 'Could not create thread.');
          return;
        }
        setOpen(false);
        onCreated(data.thread);
      }}
      className="space-y-3 rounded-xl border border-brand-line bg-white p-4 text-sm"
    >
      <select
        name="investorEmail"
        required
        className="w-full rounded-md border border-brand-line px-2 py-1.5"
      >
        <option value="">Select investor…</option>
        {investorChoices.map((c) => (
          <option key={c.email} value={c.email}>
            {c.name} ({c.email})
          </option>
        ))}
      </select>
      <input
        name="subject"
        placeholder="Subject"
        required
        maxLength={200}
        className="w-full rounded-md border border-brand-line px-2 py-1.5"
      />
      <textarea
        name="body"
        rows={3}
        placeholder="Message…"
        required
        maxLength={8000}
        className="w-full rounded-md border border-brand-line px-2 py-1.5"
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Sending…' : 'Start thread'}
        </Button>
      </div>
    </form>
  );
}
