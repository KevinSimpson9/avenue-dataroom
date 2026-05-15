import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { DocumentList } from '@/components/documents/DocumentList';
import { UploadDocument } from '@/components/documents/UploadDocument';
import {
  findByEmail,
  getDrive,
  listFolderFiles,
  loadRegistry,
  type InvestorEntry,
} from '@/lib/drive/registry';
import { InvestorEditor } from './InvestorEditor';

export const dynamic = 'force-dynamic';

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const session = await requireAdmin();
  const { email } = await params;
  const registry = await loadRegistry();
  const entry = findByEmail(registry, decodeURIComponent(email), { includeDeleted: true });
  if (!entry || entry.role !== 'investor') notFound();
  const investor = entry as InvestorEntry;

  const files = investor.folderId
    ? await listFolderFiles(getDrive(), investor.folderId)
    : [];

  return (
    <PortalShell role="admin" email={session.email}>
      <Link href="/portal/admin/investors" className="text-sm text-brand-accent hover:underline">
        ← Back to investors
      </Link>
      <h1 className="mt-4 font-display text-3xl text-brand-fg">{investor.name}</h1>
      <p className="text-sm text-brand-muted">{investor.email}</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-brand-line bg-white p-6">
          <h2 className="font-display text-lg text-brand-fg">Deal terms</h2>
          <p className="mt-1 text-xs text-brand-muted">
            Edit terms here. Changes save to the investor registry.
          </p>
          <InvestorEditor investor={investor} />
        </section>

        <section className="rounded-xl border border-brand-line bg-white p-6">
          <h2 className="font-display text-lg text-brand-fg">Status</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Password set">
              {investor.passwordHash ? 'Yes' : 'No — awaiting setup'}
            </Row>
            <Row label="Folder ID">{investor.folderId || '—'}</Row>
            <Row label="Account">
              {investor.deletedAt ? `Removed ${formatDate(investor.deletedAt)}` : 'Active'}
            </Row>
          </dl>
        </section>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-brand-fg">Documents</h2>
            <p className="mt-1 text-xs text-brand-muted">
              Files in this investor&apos;s Drive folder. They can view and download these.
            </p>
          </div>
          {investor.folderId ? <UploadDocument investorEmail={investor.email} /> : null}
        </div>
        <div className="mt-4">
          <DocumentList files={files} adminFor={investor.email} />
        </div>
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

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}
