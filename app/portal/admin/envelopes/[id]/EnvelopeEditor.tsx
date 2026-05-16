'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type {
  Envelope,
  Field as EField,
  FieldType,
  Recipient,
} from '@/lib/drive/envelopes';

type DraftField = Omit<EField, 'id' | 'status' | 'filledValue' | 'filledAt'> & {
  id?: string;
};

const FIELD_DEFAULTS = { width: 200, height: 28, required: true } as const;

export function EnvelopeEditor({ envelope }: { envelope: Envelope }) {
  const router = useRouter();
  const isDraft = envelope.status === 'draft';
  const isFinal =
    envelope.status === 'executed' || envelope.status === 'voided';
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [fields, setFields] = useState<DraftField[]>(
    envelope.fields.map((f) => ({ ...f }))
  );

  function patchField(idx: number, patch: Partial<DraftField>) {
    setFields((cur) => cur.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function addField(recipientId: string) {
    setFields((cur) => [
      ...cur,
      {
        recipientId,
        type: 'signature',
        page: 1,
        x: 100,
        y: 100,
        defaultValue: null,
        ...FIELD_DEFAULTS,
      },
    ]);
  }
  function removeField(idx: number) {
    setFields((cur) => cur.filter((_, i) => i !== idx));
  }

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
    const note = data.warning ? data.warning : `${action} succeeded.`;
    setMsg({ kind: 'ok', text: note });
    router.refresh();
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-brand-line bg-white p-6 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-brand-fg">PDF</h2>
          <a
            href={`/api/envelopes/${envelope.id}/pdf?which=source`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-brand-accent hover:underline"
          >
            View source PDF →
          </a>
        </div>
        <iframe
          src={`/api/envelopes/${envelope.id}/pdf?which=source`}
          className="mt-4 h-[600px] w-full rounded-md border border-brand-line"
          title="Source PDF"
        />
        {envelope.executedPdfId ? (
          <a
            href={`/api/envelopes/${envelope.id}/pdf?which=executed`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-brand-accent hover:underline"
          >
            Download executed copy →
          </a>
        ) : null}
      </section>

      <aside className="space-y-6">
        <RecipientList
          envelope={envelope}
          onResend={(r) => doAction('resend-invite', r.id)}
          busy={busy}
        />

        <section className="rounded-xl border border-brand-line bg-white p-6">
          <h2 className="font-display text-lg text-brand-fg">Fields</h2>
          {isDraft ? (
            <p className="mt-1 text-xs text-brand-muted">
              Coordinates in PDF points (bottom-left origin). A visual placer is coming
              in the next phase.
            </p>
          ) : (
            <p className="mt-1 text-xs text-brand-muted">
              Locked — fields can only be edited on draft envelopes.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {fields.length === 0 ? (
              <p className="text-xs text-brand-muted">No fields yet.</p>
            ) : (
              fields.map((f, idx) => (
                <FieldRow
                  key={idx}
                  field={f}
                  recipients={envelope.recipients}
                  readOnly={!isDraft}
                  onChange={(patch) => patchField(idx, patch)}
                  onRemove={() => removeField(idx)}
                />
              ))
            )}
            {isDraft &&
              envelope.recipients.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => addField(r.id)}
                  className="block w-full rounded-md border border-dashed border-brand-line px-3 py-2 text-left text-xs text-brand-muted hover:bg-brand-bg"
                >
                  + Add field for {r.name}
                </button>
              ))}
          </div>
          {isDraft ? (
            <Button
              className="mt-4 w-full"
              disabled={!!busy}
              onClick={saveFields}
            >
              {busy === 'save' ? 'Saving…' : 'Save fields'}
            </Button>
          ) : null}
        </section>

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
                  {r.role ? (
                    <p className="text-xs text-brand-muted">{r.role}</p>
                  ) : null}
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

function FieldRow({
  field,
  recipients,
  readOnly,
  onChange,
  onRemove,
}: {
  field: DraftField;
  recipients: Recipient[];
  readOnly: boolean;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}) {
  const types: FieldType[] = ['signature', 'initials', 'date', 'text'];
  return (
    <div className="rounded-md border border-brand-line bg-brand-bg/40 p-3 text-xs">
      <div className="flex items-center justify-between">
        <select
          disabled={readOnly}
          value={field.recipientId}
          onChange={(e) => onChange({ recipientId: e.target.value })}
          className="rounded border border-brand-line bg-white px-2 py-1"
        >
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          disabled={readOnly}
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          className="rounded border border-brand-line bg-white px-2 py-1"
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {!readOnly ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-700 hover:underline"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        <NumInput label="page" v={field.page} ro={readOnly} on={(v) => onChange({ page: v })} />
        <NumInput label="x" v={field.x} ro={readOnly} on={(v) => onChange({ x: v })} />
        <NumInput label="y" v={field.y} ro={readOnly} on={(v) => onChange({ y: v })} />
        <NumInput label="w" v={field.width} ro={readOnly} on={(v) => onChange({ width: v })} />
        <NumInput label="h" v={field.height} ro={readOnly} on={(v) => onChange({ height: v })} />
      </div>
    </div>
  );
}

function NumInput({
  label,
  v,
  ro,
  on,
}: {
  label: string;
  v: number;
  ro: boolean;
  on: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-brand-muted">
        {label}
      </span>
      <input
        type="number"
        readOnly={ro}
        value={v}
        onChange={(e) => on(Number(e.target.value))}
        className="mt-0.5 w-full rounded border border-brand-line bg-white px-1.5 py-1 text-xs"
      />
    </label>
  );
}
