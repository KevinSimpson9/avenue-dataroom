import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { loadAudit } from '@/lib/drive/audit';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const session = await requireAdmin('/portal/admin/audit');
  const file = await loadAudit();
  const entries = [...file.entries].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 200);

  return (
    <PortalShell role="admin" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Audit log</h1>
      <p className="mt-2 text-sm text-brand-muted">
        Most recent {entries.length} mutations across the portal. Capped at 2,000 entries
        on disk.
      </p>
      <div className="mt-8 overflow-hidden rounded-xl border border-brand-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg/60 text-xs uppercase tracking-wider text-brand-muted">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Actor</th>
              <th className="px-4 py-2 text-left">Action</th>
              <th className="px-4 py-2 text-left">Target</th>
              <th className="px-4 py-2 text-left">Meta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-brand-muted">
                  No audit entries yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-4 py-2 text-xs text-brand-muted">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <p>{e.actorEmail || '—'}</p>
                    <p className="text-brand-muted">{e.actorRole || ''}</p>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-2 truncate text-xs text-brand-fg">
                    {e.target || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-brand-muted">
                    {e.meta ? (
                      <code className="block max-w-md truncate">
                        {JSON.stringify(e.meta)}
                      </code>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
