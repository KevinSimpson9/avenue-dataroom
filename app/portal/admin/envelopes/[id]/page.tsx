import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { findEnvelope, loadEnvelopes } from '@/lib/drive/envelopes';
import { EnvelopeEditor } from './EnvelopeEditor';

export const dynamic = 'force-dynamic';

export default async function EnvelopeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const file = await loadEnvelopes();
  const env = findEnvelope(file, id);
  if (!env) notFound();

  return (
    <PortalShell role="admin" email={session.email}>
      <Link href="/portal/admin/envelopes" className="text-sm text-brand-accent hover:underline">
        ← Back to envelopes
      </Link>
      <h1 className="mt-4 font-display text-3xl text-brand-fg">{env.title}</h1>
      <p className="text-sm text-brand-muted">
        Status: <span className="text-brand-fg">{env.status}</span>
        {env.sentAt ? ` · Sent ${new Date(env.sentAt).toLocaleDateString()}` : null}
        {env.executedAt ? ` · Executed ${new Date(env.executedAt).toLocaleDateString()}` : null}
      </p>

      <EnvelopeEditor envelope={env} />
    </PortalShell>
  );
}
