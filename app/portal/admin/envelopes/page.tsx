import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { loadEnvelopes, type EnvelopeStatus } from '@/lib/drive/envelopes';
import { NewEnvelopeButton } from './NewEnvelopeButton';

export const dynamic = 'force-dynamic';

export default async function AdminEnvelopesPage() {
  const session = await requireAdmin('/portal/admin/envelopes');
  const file = await loadEnvelopes();
  const envelopes = [...file.envelopes].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  return (
    <PortalShell role="admin" email={session.email}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-fg">Envelopes</h1>
          <p className="mt-2 text-sm text-brand-muted">
            Signing jobs across all investors.
          </p>
        </div>
        <NewEnvelopeButton />
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-brand-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg/60 text-xs uppercase tracking-wider text-brand-muted">
            <tr>
              <th className="px-5 py-3 text-left">Title</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Recipients</th>
              <th className="px-5 py-3 text-left">Created</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {envelopes.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-brand-muted" colSpan={5}>
                  No envelopes yet. Click <em>New envelope</em> to create one.
                </td>
              </tr>
            ) : (
              envelopes.map((e) => {
                const signed = e.recipients.filter((r) => r.signedAt).length;
                return (
                  <tr key={e.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-brand-fg">{e.title}</p>
                      <p className="text-xs text-brand-muted">{e.sourcePdfName}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={e.status} />
                    </td>
                    <td className="px-5 py-4 text-brand-muted">
                      {signed}/{e.recipients.length} signed
                    </td>
                    <td className="px-5 py-4 text-brand-muted">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/portal/admin/envelopes/${e.id}`}
                        className="text-sm text-brand-accent hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}

function StatusPill({ status }: { status: EnvelopeStatus }) {
  const map: Record<EnvelopeStatus, string> = {
    draft: 'bg-brand-bg text-brand-muted',
    sent: 'bg-blue-50 text-blue-700',
    'partially-signed': 'bg-yellow-50 text-yellow-800',
    executed: 'bg-green-50 text-green-700',
    voided: 'bg-red-50 text-red-700',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${map[status]}`}>{status}</span>
  );
}
