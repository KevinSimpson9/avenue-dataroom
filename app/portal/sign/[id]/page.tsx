import { notFound } from 'next/navigation';
import { requireInvestor } from '@/lib/auth/current-user';
import { AuthShell } from '@/components/ui/AuthShell';
import {
  canRecipientSignNow,
  findEnvelope,
  loadEnvelopes,
} from '@/lib/drive/envelopes';
import { SignForm } from './SignForm';

export const dynamic = 'force-dynamic';

export default async function SignByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireInvestor();
  const { id } = await params;
  const file = await loadEnvelopes();
  const env = findEnvelope(file, id);
  if (!env) notFound();
  const recipient = env.recipients.find((r) => r.email === session.email);
  if (!recipient) notFound();

  return (
    <AuthShell title={env.title}>
      <SignForm
        envelope={{
          id: env.id,
          title: env.title,
          status: env.status,
          enforceOrder: env.enforceOrder,
        }}
        recipientName={recipient.name}
        canSign={canRecipientSignNow(env, recipient)}
        alreadySigned={!!recipient.signedAt}
        fields={env.fields
          .filter((f) => f.recipientId === recipient.id)
          .map((f) => ({
            id: f.id,
            type: f.type,
            page: f.page,
            required: f.required,
            defaultValue: f.defaultValue,
          }))}
        pdfUrl={`/api/envelopes/${env.id}/pdf?which=source`}
        executedPdfUrl={env.executedPdfId ? `/api/envelopes/${env.id}/pdf?which=executed` : null}
      />
    </AuthShell>
  );
}
