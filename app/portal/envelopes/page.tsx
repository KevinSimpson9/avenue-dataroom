import Link from 'next/link';
import { requireInvestor } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { loadEnvelopes, canRecipientSignNow } from '@/lib/drive/envelopes';

export const dynamic = 'force-dynamic';

export default async function InvestorEnvelopesPage() {
  const session = await requireInvestor('/portal/envelopes');
  const file = await loadEnvelopes();

  const mine = file.envelopes
    .map((env) => {
      const recipient = env.recipients.find((r) => r.email === session.email);
      if (!recipient) return null;
      return { env, recipient };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (b.env.sentAt || b.env.createdAt).localeCompare(a.env.sentAt || a.env.createdAt));

  return (
    <PortalShell role="investor" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Signing</h1>
      <p className="mt-2 text-sm text-brand-muted">
        Documents you&apos;ve been asked to sign.
      </p>

      {mine.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-brand-line bg-white px-5 py-8 text-center text-sm text-brand-muted">
          Nothing waiting on you right now.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {mine.map(({ env, recipient }) => {
            const canSign = canRecipientSignNow(env, recipient);
            const ready =
              !recipient.signedAt && (env.status === 'sent' || env.status === 'partially-signed');
            return (
              <li
                key={env.id}
                className="flex items-center justify-between rounded-xl border border-brand-line bg-white px-5 py-4"
              >
                <div>
                  <p className="font-medium text-brand-fg">{env.title}</p>
                  <p className="text-xs text-brand-muted">
                    {recipient.signedAt
                      ? `Signed ${new Date(recipient.signedAt).toLocaleDateString()}`
                      : env.status === 'voided'
                      ? 'Voided'
                      : ready && canSign
                      ? 'Ready for your signature'
                      : ready
                      ? 'Waiting on others first'
                      : env.status}
                  </p>
                </div>
                {recipient.signedAt && env.executedPdfId ? (
                  <a
                    href={`/api/envelopes/${env.id}/pdf?which=executed`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-brand-accent hover:underline"
                  >
                    Download executed
                  </a>
                ) : canSign ? (
                  <Link
                    href={`/portal/sign/${env.id}`}
                    className="rounded-md bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Sign now
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
