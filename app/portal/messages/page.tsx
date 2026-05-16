import { requireInvestor } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { MessagesView } from '@/components/messages/MessagesView';
import { loadMessages } from '@/lib/drive/messages';

export const dynamic = 'force-dynamic';

export default async function InvestorMessagesPage() {
  const session = await requireInvestor('/portal/messages');
  const file = await loadMessages();
  const mine = file.threads.filter(
    (t) => t.investorEmail.toLowerCase() === session.email.toLowerCase()
  );
  return (
    <PortalShell role="investor" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Messages</h1>
      <p className="mt-2 text-sm text-brand-muted">
        Direct messages from the team.
      </p>
      <div className="mt-8">
        <MessagesView role="investor" selfEmail={session.email} initialThreads={mine} />
      </div>
    </PortalShell>
  );
}
