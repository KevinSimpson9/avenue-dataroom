'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DriveFileMeta } from '@/lib/drive/registry';
import { Button } from '@/components/ui/Button';

interface Props {
  files: DriveFileMeta[];
  /** When set, enables admin actions (delete) and uploads scoped to this investor. */
  adminFor?: string;
}

export function DocumentList({ files, adminFor }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(fileId: string, name: string) {
    if (!confirm(`Delete "${name}"? This moves it to Drive trash.`)) return;
    setBusyId(fileId);
    setError(null);
    const res = await fetch(`/api/documents/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    setBusyId(null);
    if (!res.ok) {
      setError('Delete failed.');
      return;
    }
    router.refresh();
  }

  if (files.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-brand-line bg-white px-5 py-8 text-center text-sm text-brand-muted">
        No documents yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-bg/60 text-xs uppercase tracking-wider text-brand-muted">
          <tr>
            <th className="px-5 py-3 text-left">Name</th>
            <th className="px-5 py-3 text-left">Added</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-line">
          {files.map((f) => (
            <tr key={f.id}>
              <td className="px-5 py-3 text-brand-fg">
                <FileIcon mime={f.mimeType} /> {f.name}
              </td>
              <td className="px-5 py-3 text-brand-muted">
                {new Date(f.createdTime).toLocaleDateString()}
              </td>
              <td className="px-5 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <a
                    href={`/api/documents/${encodeURIComponent(f.id)}?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-brand-accent hover:underline"
                  >
                    View
                  </a>
                  <a
                    href={`/api/documents/${encodeURIComponent(f.id)}`}
                    className="text-sm text-brand-accent hover:underline"
                  >
                    Download
                  </a>
                  {adminFor ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === f.id}
                      onClick={() => onDelete(f.id, f.name)}
                    >
                      {busyId === f.id ? '…' : 'Delete'}
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? (
        <p className="border-t border-brand-line bg-red-50 px-5 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  const isPdf = mime.includes('pdf');
  const isImg = mime.startsWith('image/');
  const label = isPdf ? 'PDF' : isImg ? 'IMG' : 'DOC';
  return (
    <span className="mr-2 inline-block rounded bg-brand-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-muted">
      {label}
    </span>
  );
}
