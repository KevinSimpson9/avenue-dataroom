'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { EnvelopeStatus, FieldType } from '@/lib/drive/envelopes';

interface FieldStub {
  id: string;
  type: FieldType;
  page: number;
  required: boolean;
  defaultValue: string | null;
}

interface Props {
  envelope: {
    id: string;
    title: string;
    status: EnvelopeStatus;
    enforceOrder: boolean;
  };
  recipientName: string;
  canSign: boolean;
  alreadySigned: boolean;
  fields: FieldStub[];
  token?: string;
  pdfUrl: string;
  executedPdfUrl: string | null;
}

export function SignForm({
  envelope,
  recipientName,
  canSign,
  alreadySigned,
  fields,
  token,
  pdfUrl,
  executedPdfUrl,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields
        .filter((f) => f.type !== 'date')
        .map((f) => [
          f.id,
          f.type === 'signature' || f.type === 'initials'
            ? recipientName.split(/\s+/).map((w) => (f.type === 'initials' ? w[0] : w)).join(f.type === 'initials' ? '' : ' ')
            : f.defaultValue ?? '',
        ])
    )
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ allSigned: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<number, FieldStub[]>();
    for (const f of fields) {
      const arr = map.get(f.page) || [];
      arr.push(f);
      map.set(f.page, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [fields]);

  if (alreadySigned) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-brand-fg">
          You&apos;ve already signed <strong>{envelope.title}</strong>.
        </p>
        {executedPdfUrl ? (
          <a
            href={executedPdfUrl}
            className="inline-block rounded-md bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Download executed copy
          </a>
        ) : (
          <p className="text-xs text-brand-muted">
            The executed copy will be available once all recipients have signed.
          </p>
        )}
      </div>
    );
  }

  if (envelope.status === 'voided') {
    return (
      <p className="text-sm text-brand-muted">This envelope has been voided.</p>
    );
  }

  if (!canSign) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-brand-fg">
          Thanks for opening this. Other signers need to complete their portion first
          before it&apos;s your turn.
        </p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-brand-accent hover:underline"
        >
          Preview the document →
        </a>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = Object.entries(values).map(([id, value]) => ({ id, value }));
    const res = await fetch(`/api/envelopes/${envelope.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign', token: token || '', fields: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.message || 'Could not sign.');
      return;
    }
    setDone({ allSigned: !!data.allSigned });
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-brand-fg">
          {done.allSigned
            ? `Signed! Everyone has now signed "${envelope.title}". An executed copy is on its way to your inbox.`
            : `Signed. We'll let you know when the remaining recipients have completed their portion.`}
        </p>
        <a
          href="/portal/envelopes"
          className="inline-block text-sm text-brand-accent hover:underline"
        >
          Back to your envelopes →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-brand-muted">
        Review the document, then complete the fields below and submit.
      </p>
      <a
        href={pdfUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-sm text-brand-accent hover:underline"
      >
        Open the PDF in a new tab →
      </a>

      <div className="space-y-4">
        {grouped.map(([page, pageFields]) => (
          <fieldset key={page} className="rounded-md border border-brand-line bg-white p-4">
            <legend className="px-1 text-xs uppercase tracking-wider text-brand-muted">
              Page {page}
            </legend>
            <div className="space-y-3">
              {pageFields.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  value={values[f.id] ?? ''}
                  onChange={(v) => setValues((cur) => ({ ...cur, [f.id]: v }))}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Signing…' : 'Sign and submit'}
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldStub;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === 'date') {
    return (
      <p className="text-xs text-brand-muted">
        Today&apos;s date will be auto-filled.
      </p>
    );
  }
  const label = field.type[0].toUpperCase() + field.type.slice(1);
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-brand-muted">
        {label}
        {field.required ? '' : ' (optional)'}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        className={`mt-1 w-full rounded-md border border-brand-line bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent ${
          field.type === 'signature' ? 'font-display italic text-lg' : ''
        }`}
      />
    </label>
  );
}
