import { requireInvestor } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import {
  findByEmail,
  loadRegistry,
  type InvestorEntry,
} from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';

export default async function InvestorDashboardPage() {
  const session = await requireInvestor('/portal/dashboard');
  const registry = await loadRegistry();
  const entry = findByEmail(registry, session.email) as InvestorEntry | null;

  return (
    <PortalShell role="investor" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">
        Welcome{entry?.name ? `, ${entry.name.split(' ')[0]}` : ''}.
      </h1>
      <p className="mt-2 text-sm text-brand-muted">
        Here&apos;s a snapshot of your investment.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-brand-line bg-white p-6">
          <h2 className="font-display text-lg text-brand-fg">Your terms</h2>
          {entry ? (
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Principal">{formatMoney(entry.principal)}</Row>
              <Row label="Rate">{entry.rate || '—'}</Row>
              <Row label="Term">{entry.termMonths ? `${entry.termMonths} months` : '—'}</Row>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-brand-muted">Account details unavailable.</p>
          )}
        </section>

        <section className="rounded-xl border border-brand-line bg-white p-6">
          <h2 className="font-display text-lg text-brand-fg">Signing status</h2>
          <p className="mt-4 text-sm text-brand-muted">
            Documents to sign will appear here as they&apos;re sent.
          </p>
        </section>
      </div>
    </PortalShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-brand-muted">{label}</dt>
      <dd className="text-right text-brand-fg">{children}</dd>
    </div>
  );
}

function formatMoney(n: number | null | undefined) {
  if (!n) return '—';
  return Number(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
