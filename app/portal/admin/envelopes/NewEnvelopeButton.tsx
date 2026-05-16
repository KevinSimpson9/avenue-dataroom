'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

interface RecipientRow {
  name: string;
  email: string;
  role: string;
}

export function NewEnvelopeButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([
    { name: '', email: '', role: '' },
  ]);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function update(idx: number, patch: Partial<RecipientRow>) {
    setRecipients((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a PDF first.');
      setBusy(false);
      return;
    }
    const body = new FormData();
    body.append('title', String(fd.get('title') || ''));
    body.append('enforceOrder', String(fd.get('enforceOrder') === 'on'));
    body.append('ccAdmin', String(fd.get('ccAdmin') !== 'off'));
    body.append('pdf', file);
    body.append(
      'recipients',
      JSON.stringify(
        recipients
          .filter((r) => r.email || r.name)
          .map((r, i) => ({ ...r, order: i + 1 }))
      )
    );
    const res = await fetch('/api/envelopes', { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.message || 'Could not create envelope.');
      return;
    }
    setOpen(false);
    router.push(`/portal/admin/envelopes/${data.envelope.id}`);
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New envelope</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-brand-line bg-white p-6 shadow-xl">
        <h2 className="font-display text-xl text-brand-fg">New envelope</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Upload the PDF and add recipients. You&apos;ll place fields on the next screen
          before sending.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Title" name="title" required defaultValue="" maxLength={200} />
          <div>
            <span className="text-xs uppercase tracking-wider text-brand-muted">
              Source PDF
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="mt-1 block w-full text-sm"
            />
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider text-brand-muted">
              Recipients
            </span>
            <div className="mt-2 space-y-2">
              {recipients.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input
                    placeholder="Full name"
                    value={r.name}
                    onChange={(e) => update(idx, { name: e.target.value })}
                    className="col-span-4 rounded-md border border-brand-line px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="email@example.com"
                    type="email"
                    value={r.email}
                    onChange={(e) => update(idx, { email: e.target.value })}
                    className="col-span-5 rounded-md border border-brand-line px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Role (optional)"
                    value={r.role}
                    onChange={(e) => update(idx, { role: e.target.value })}
                    className="col-span-3 rounded-md border border-brand-line px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRecipients((rs) => [...rs, { name: '', email: '', role: '' }])
                }
                className="text-xs text-brand-accent hover:underline"
              >
                + Add another recipient
              </button>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="enforceOrder" />
              Enforce signing order
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ccAdmin" defaultChecked />
              BCC admin on invites
            </label>
          </div>

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create draft'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
