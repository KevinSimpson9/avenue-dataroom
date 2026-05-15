'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function UploadDocument({ investorEmail }: { investorEmail: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append('investor', investorEmail);
    fd.append('file', file);
    const res = await fetch('/api/documents', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (!res.ok || !data.ok) {
      setError(data.message || 'Upload failed.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onChange}
        disabled={busy}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : 'Upload document'}
      </Button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
