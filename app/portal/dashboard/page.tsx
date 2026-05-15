import Link from 'next/link';
import { requireInvestor } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import {
  findByEmail,
  getDrive,
  listFolderFiles,
  loadRegistry,
  type InvestorEntry,
} from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';

export default async function InvestorDashboardPage() {
  const session = await requireInvestor('/portal/dashboard');
  const registry = await loadRegistry();
  const entry = findByEmail(registry, session.email) as InvestorEntry | null;

  const recentDocs = entry?.folderId
    ? (await listFolderFiles(getDrive(), entry.folderId)).slice(0, 5)
    : [];

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
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-brand-fg">Recent documents</h2>
            <Link
              href="/portal/documents"
              className="text-xs text-brand-accent hover:underline"
            >
              View all →
            </Link>
          </div>
          {recentDocs.length === 0 ? (
            <p className="mt-4 text-sm text-brand-muted">No documents shared yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {recentDocs.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <a
                    href={`/api/documents/${encodeURIComponent(f.id)}?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-brand-fg hover:text-brand-accent"
                  >
                    {f.name}
                  </a>
                  <span className="ml-3 shrink-0 text-xs text-brand-muted">
                    {new Date(f.createdTime).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10 rounded-xl border border-brand-line bg-white p-6">
        <h2 className="font-display text-lg text-brand-fg">Signing status</h2>
        <p className="mt-4 text-sm text-brand-muted">
          Documents awaiting your signature will appear here when sent.
        </p>
      </section>
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
