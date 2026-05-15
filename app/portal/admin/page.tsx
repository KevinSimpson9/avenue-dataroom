import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { loadRegistry, type InvestorEntry } from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await requireAdmin('/portal/admin');
  const registry = await loadRegistry();
  const investors = registry.entries.filter(
    (e): e is InvestorEntry => e.role === 'investor' && !e.deletedAt
  );

  const totalPrincipal = investors.reduce((sum, i) => sum + (i.principal || 0), 0);
  const awaitingSetup = investors.filter((i) => !i.passwordHash).length;
  const fullySigned = investors.filter((i) => i.signedAt).length;

  return (
    <PortalShell role="admin" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Dashboard</h1>
      <p className="mt-2 text-sm text-brand-muted">
        High-level snapshot of the investor base.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Investors" value={String(investors.length)} />
        <Kpi label="Total principal" value={formatMoney(totalPrincipal)} />
        <Kpi label="Awaiting password setup" value={String(awaitingSetup)} />
        <Kpi label="Fully signed" value={String(fullySigned)} />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-xl text-brand-fg">Recent investors</h2>
        <Link
          href="/portal/admin/investors"
          className="text-sm text-brand-accent hover:underline"
        >
          View all →
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-brand-line overflow-hidden rounded-xl border border-brand-line bg-white">
        {investors.length === 0 ? (
          <li className="px-5 py-6 text-sm text-brand-muted">No investors yet.</li>
        ) : (
          investors.slice(0, 8).map((i) => (
            <li key={i.email} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-brand-fg">{i.name}</p>
                <p className="text-xs text-brand-muted">{i.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-brand-fg">{formatMoney(i.principal)}</p>
                <p className="text-xs text-brand-muted">
                  {i.passwordHash ? 'Active' : 'Awaiting setup'}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </PortalShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-brand-line bg-white p-5">
      <p className="text-xs uppercase tracking-wider text-brand-muted">{label}</p>
      <p className="mt-2 font-display text-2xl text-brand-fg">{value}</p>
    </div>
  );
}

function formatMoney(n: number | null | undefined) {
  if (!n) return '$0';
  return Number(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
