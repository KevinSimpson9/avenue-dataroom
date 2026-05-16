import { AuthShell } from '@/components/ui/AuthShell';
import { verifyToken } from '@/lib/auth/tokens';
import {
  canRecipientSignNow,
  findEnvelope,
  loadEnvelopes,
} from '@/lib/drive/envelopes';
import { SignForm } from '../SignForm';

export const dynamic = 'force-dynamic';

export default async function SignByTokenPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>;
}) {
  const { id, token } = await params;
  const v = verifyToken(token);

  const file = await loadEnvelopes();
  const env = findEnvelope(file, id);
  const valid =
    !!v &&
    v.purpose === 'sign-envelope' &&
    !!env &&
    v.nonce.startsWith(`${env.id}:`);

  if (!valid || !env) {
    return (
      <AuthShell title="Link unavailable">
        <p className="text-sm text-brand-muted">
          This signing link is no longer valid. Single-use links are rotated after each
          signature. Ask the sender to resend it.
        </p>
      </AuthShell>
    );
  }

  const [, nonce] = v!.nonce.split(':');
  const recipient = env.recipients.find(
    (r) => r.email === v!.email && r.signNonce === nonce
  );
  if (!recipient) {
    return (
      <AuthShell title="Link unavailable">
        <p className="text-sm text-brand-muted">
          This signing link has already been used. Ask the sender to resend it.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={env.title} subtitle={`Signing as ${recipient.name}`}>
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
        token={token}
        pdfUrl={`/api/envelopes/${env.id}/pdf?which=source&token=${encodeURIComponent(token)}`}
        executedPdfUrl={
          env.executedPdfId
            ? `/api/envelopes/${env.id}/pdf?which=executed&token=${encodeURIComponent(token)}`
            : null
        }
      />
    </AuthShell>
  );
}
