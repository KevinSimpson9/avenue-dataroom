'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import type { Update } from '@/lib/drive/updates';

interface Props {
  role: 'admin' | 'investor';
  initialUpdates: Update[];
}

export function UpdatesView({ role, initialUpdates }: Props) {
  const [updates, setUpdates] = useState(initialUpdates);
  const router = useRouter();

  async function publish(form: FormData) {
    const res = await fetch('/api/updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        body: form.get('body'),
        audience: 'all',
        pinned: form.get('pinned') === 'on',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setUpdates((cur) => [data.update, ...cur]);
      router.refresh();
    }
    return data;
  }

  async function remove(id: string) {
    if (!confirm('Delete this update?')) return;
    await fetch(`/api/updates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setUpdates((cur) => cur.filter((u) => u.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {role === 'admin' ? <Composer onPublish={publish} /> : null}
      <ul className="space-y-4">
        {updates.length === 0 ? (
          <li className="rounded-xl border border-dashed border-brand-line bg-white px-5 py-8 text-center text-sm text-brand-muted">
            No updates yet.
          </li>
        ) : (
          updates.map((u) => (
            <li
              id={u.id}
              key={u.id}
              className="rounded-xl border border-brand-line bg-white p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-brand-muted">
                    {new Date(u.publishedAt).toLocaleDateString()}{' '}
                    {u.pinned ? '· Pinned' : ''}
                  </p>
                  <h2 className="mt-1 font-display text-xl text-brand-fg">{u.title}</h2>
                </div>
                {role === 'admin' ? (
                  <Button size="sm" variant="danger" onClick={() => remove(u.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-brand-fg">{u.body}</p>
              <p className="mt-3 text-xs text-brand-muted">— {u.authorEmail}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Composer({
  onPublish,
}: {
  onPublish: (fd: FormData) => Promise<{ ok?: boolean; message?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const out = await onPublish(fd);
        setBusy(false);
        if (!out.ok) {
          setError(out.message || 'Publish failed.');
          return;
        }
        e.currentTarget.reset();
      }}
      className="space-y-3 rounded-xl border border-brand-line bg-white p-6"
    >
      <h2 className="font-display text-lg text-brand-fg">New update</h2>
      <Field label="Title" name="title" required maxLength={200} />
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-brand-muted">Body</span>
        <textarea
          name="body"
          rows={5}
          maxLength={20000}
          required
          className="mt-1 w-full rounded-md border border-brand-line bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pinned" />
        Pin to the top
      </label>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Publishing…' : 'Publish to all investors'}
        </Button>
      </div>
    </form>
  );
}
