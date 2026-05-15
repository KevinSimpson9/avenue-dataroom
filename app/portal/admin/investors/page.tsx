import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { loadRegistry, type InvestorEntry } from '@/lib/drive/registry';
import { AddInvestorButton } from './AddInvestorButton';

export const dynamic = 'force-dynamic';

export default async function InvestorsPage() {
  const session = await requireAdmin('/portal/admin/investors');
  const registry = await loadRegistry();
  const investors = registry.entries.filter(
    (e): e is InvestorEntry => e.role === 'investor'
  );

  return (
    <PortalShell role="admin" email={session.email}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-fg">Investors</h1>
          <p className="mt-2 text-sm text-brand-muted">
            Manage investor accounts, deal terms, and setup links.
          </p>
        </div>
        <AddInvestorButton />
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-brand-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg/60 text-xs uppercase tracking-wider text-brand-muted">
            <tr>
              <th className="px-5 py-3 text-left">Investor</th>
              <th className="px-5 py-3 text-right">Principal</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {investors.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-brand-muted" colSpan={4}>
                  No investors yet. Click <em>Add investor</em> to create one.
                </td>
              </tr>
            ) : (
              investors.map((i) => (
                <tr key={i.email} className={i.deletedAt ? 'opacity-50' : ''}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-brand-fg">{i.name}</p>
                    <p className="text-xs text-brand-muted">{i.email}</p>
                  </td>
                  <td className="px-5 py-4 text-right text-brand-fg">
                    {formatMoney(i.principal)}
                  </td>
                  <td className="px-5 py-4 text-brand-muted">
                    <StatusBadge investor={i} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/portal/admin/investors/${encodeURIComponent(i.email)}`}
                      className="text-sm text-brand-accent hover:underline"
                    >
                      Open
                    </Link>
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

function StatusBadge({ investor }: { investor: InvestorEntry }) {
  if (investor.deletedAt) return <span className="text-xs">Removed</span>;
  if (!investor.passwordHash) return <span className="text-xs">Awaiting setup</span>;
  if (investor.signedAt) return <span className="text-xs">Fully executed</span>;
  return <span className="text-xs">Active</span>;
}

function formatMoney(n: number | null | undefined) {
  if (!n) return '—';
  return Number(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
