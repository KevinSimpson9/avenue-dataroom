'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import type { InvestorEntry } from '@/lib/drive/registry';

export function InvestorEditor({ investor }: { investor: InvestorEntry }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy('save');
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/investors/${encodeURIComponent(investor.email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        principal: fd.get('principal'),
        rate: fd.get('rate'),
        termMonths: fd.get('termMonths'),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || !data.ok) {
      setMsg({ kind: 'err', text: data.message || 'Save failed.' });
      return;
    }
    setMsg({ kind: 'ok', text: 'Saved.' });
    router.refresh();
  }

  async function action(kind: 'resend-setup' | 'resend-reset' | 'remove') {
    if (busy) return;
    setBusy(kind);
    setMsg(null);
    if (kind === 'remove') {
      if (!confirm(`Remove ${investor.name}? They'll be soft-deleted and can no longer sign in.`)) {
        setBusy(null);
        return;
      }
      const res = await fetch(`/api/investors/${encodeURIComponent(investor.email)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok || !data.ok) {
        setMsg({ kind: 'err', text: data.message || 'Could not remove.' });
        return;
      }
      router.refresh();
      return;
    }
    const res = await fetch(`/api/investors/${encodeURIComponent(investor.email)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: kind }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || !data.ok) {
      setMsg({ kind: 'err', text: data.message || 'Could not send link.' });
      return;
    }
    setMsg({
      kind: 'ok',
      text: data.sent ? 'Email sent.' : `Saved, but email did not send (${data.reason || 'unknown'}).`,
    });
  }

  return (
    <>
      <form onSubmit={save} className="mt-4 space-y-4">
        <Field label="Full name" name="name" defaultValue={investor.name} required />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Principal (USD)"
            name="principal"
            type="number"
            min={0}
            step="1000"
            defaultValue={investor.principal}
          />
          <Field
            label="Term (months)"
            name="termMonths"
            type="number"
            min={0}
            defaultValue={investor.termMonths}
          />
        </div>
        <Field label="Rate" name="rate" defaultValue={investor.rate} />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" disabled={!!busy}>
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </Button>
          {!investor.passwordHash ? (
            <Button
              type="button"
              variant="secondary"
              disabled={!!busy}
              onClick={() => action('resend-setup')}
            >
              {busy === 'resend-setup' ? 'Sending…' : 'Resend setup link'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={!!busy}
              onClick={() => action('resend-reset')}
            >
              {busy === 'resend-reset' ? 'Sending…' : 'Send reset link'}
            </Button>
          )}
          {!investor.deletedAt ? (
            <Button
              type="button"
              variant="danger"
              disabled={!!busy}
              onClick={() => action('remove')}
            >
              Remove investor
            </Button>
          ) : null}
        </div>
        {msg ? (
          <p
            className={`rounded-md px-3 py-2 text-xs ${
              msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </form>
    </>
  );
}
