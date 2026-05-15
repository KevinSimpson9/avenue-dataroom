'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export function AddInvestorButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/investors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        email: fd.get('email'),
        principal: fd.get('principal'),
        rate: fd.get('rate'),
        termMonths: fd.get('termMonths'),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setError(data.message || 'Could not add investor.');
      setBusy(false);
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add investor</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-brand-line bg-white p-6 shadow-xl">
        <h2 className="font-display text-xl text-brand-fg">Add investor</h2>
        <p className="mt-1 text-sm text-brand-muted">
          They&apos;ll receive a setup link by email to choose their password.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Full name" name="name" required maxLength={120} />
          <Field label="Email" name="email" type="email" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal (USD)" name="principal" type="number" min={0} step="1000" />
            <Field label="Term (months)" name="termMonths" type="number" min={0} />
          </div>
          <Field label="Rate" name="rate" placeholder="e.g. 20% per annum" />
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add and email setup link'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
