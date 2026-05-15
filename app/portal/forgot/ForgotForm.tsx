'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export function ForgotForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request-reset',
        email: String(fd.get('email') || ''),
      }),
    });
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-sm text-brand-fg">
        If an account exists for that email, a reset link is on its way. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Sending…' : 'Email me a reset link'}
      </Button>
    </form>
  );
}
