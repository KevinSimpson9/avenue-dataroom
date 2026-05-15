'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export function ChoosePasswordForm({
  action,
  token,
}: {
  action: 'complete-setup' | 'complete-reset';
  token: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const pwd = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm') || '');
    if (pwd !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, password: pwd }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setError(data.message || 'Could not save password.');
      setBusy(false);
      return;
    }
    window.location.href = data.redirect || '/portal/dashboard';
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        hint="At least 10 characters."
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
      />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Saving…' : 'Save password and sign in'}
      </Button>
    </form>
  );
}
