'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { FieldPlacer, type DraftField } from '@/components/envelope/FieldPlacer';
import type { Envelope, Recipient } from '@/lib/drive/envelopes';

export function EnvelopeEditor({ envelope }: { envelope: Envelope }) {
  const router = useRouter();
  const isDraft = envelope.status === 'draft';
  const isFinal = envelope.status === 'executed' || envelope.status === 'voided';
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [fields, setFields] = useState<DraftField[]>(
    envelope.fields.map((f) => ({
      id: f.id,
      recipientId: f.recipientId,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      defaultValue: f.defaultValue,
    }))
  );

  async function saveFields() {
    if (busy) return;
    setBusy('save');
    setMsg(null);
    const res = await fetch(`/api/envelopes/${envelope.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || !data.ok) {
      setMsg({ kind: 'err', text: data.message || 'Save failed.' });
      return;
    }
    setMsg({ kind: 'ok', text: 'Fields saved.' });
    router.refresh();
  }

  async function doAction(action: 'send' | 'void' | 'resend-invite', recipientId?: string) {
    if (busy) return;
    setBusy(action);
    setMsg(null);
    const res = await fetch(`/api/envelopes/${envelope.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, recipientId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || !data.ok) {
      setMsg({ kind: 'err', text: data.message || `${action} failed.` });
      return;
    }
    setMsg({ kind: 'ok', text: data.warning ?? `${action} succeeded.` });
    router.refresh();
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-brand-fg">
            {isDraft ? 'Place fields' : 'PDF'}
          </h2>
          <div className="flex items-center gap-3">
            <a
              href={`/api/envelopes/${envelope.id}/pdf?which=source`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-accent hover:underline"
            >
              Open source →
            </a>
            {envelope.executedPdfId ? (
              <a
                href={`/api/envelopes/${envelope.id}/pdf?which=executed`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand-accent hover:underline"
              >
                Open executed →
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <FieldPlacer
            pdfUrl={`/api/envelopes/${envelope.id}/pdf?which=source`}
            recipients={envelope.recipients}
            initial={fields}
            readOnly={!isDraft}
            onChange={setFields}
          />
        </div>
        {isDraft ? (
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button disabled={!!busy} onClick={saveFields}>
              {busy === 'save' ? 'Saving fields…' : 'Save fields'}
            </Button>
          </div>
        ) : null}
      </section>

      <aside className="space-y-6">
        <RecipientList
          envelope={envelope}
          onResend={(r) => doAction('resend-invite', r.id)}
          busy={busy}
        />

        <section className="rounded-xl border border-brand-line bg-white p-6">
          <h2 className="font-display text-lg text-brand-fg">Actions</h2>
          <div className="mt-4 flex flex-col gap-3">
            {isDraft ? (
              <Button disabled={!!busy} onClick={() => doAction('send')}>
                {busy === 'send' ? 'Sending…' : 'Send envelope'}
              </Button>
            ) : null}
            {!isFinal ? (
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={() => doAction('void')}
              >
                {busy === 'void' ? 'Voiding…' : 'Void envelope'}
              </Button>
            ) : null}
          </div>
        </section>

        {msg ? (
          <p
            className={`rounded-md px-3 py-2 text-xs ${
              msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function RecipientList({
  envelope,
  onResend,
  busy,
}: {
  envelope: Envelope;
  onResend: (r: Recipient) => void;
  busy: string | null;
}) {
  return (
    <section className="rounded-xl border border-brand-line bg-white p-6">
      <h2 className="font-display text-lg text-brand-fg">Recipients</h2>
      <ul className="mt-4 space-y-3 text-sm">
        {envelope.recipients
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((r) => (
            <li key={r.id} className="border-b border-brand-line pb-3 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-brand-fg">
                    {r.order}. {r.name}
                  </p>
                  <p className="truncate text-xs text-brand-muted">{r.email}</p>
                  {r.role ? <p className="text-xs text-brand-muted">{r.role}</p> : null}
                </div>
                <div className="text-right text-xs text-brand-muted">
                  {r.signedAt ? (
                    <span className="text-green-700">
                      Signed {new Date(r.signedAt).toLocaleDateString()}
                    </span>
                  ) : r.invitedAt ? (
                    <span>Invited {new Date(r.invitedAt).toLocaleDateString()}</span>
                  ) : (
                    <span>Not invited</span>
                  )}
                </div>
              </div>
              {!r.signedAt &&
              (envelope.status === 'sent' || envelope.status === 'partially-signed') ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={!!busy}
                  onClick={() => onResend(r)}
                >
                  Resend invite
                </Button>
              ) : null}
            </li>
          ))}
      </ul>
    </section>
  );
}
