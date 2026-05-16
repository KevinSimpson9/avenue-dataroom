import { requireInvestor } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { UpdatesView } from '@/components/updates/UpdatesView';
import { isVisibleTo, loadUpdates } from '@/lib/drive/updates';

export const dynamic = 'force-dynamic';

export default async function InvestorUpdatesPage() {
  const session = await requireInvestor('/portal/updates');
  const file = await loadUpdates();
  const updates = file.updates
    .filter((u) => isVisibleTo(u, session.email))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });
  return (
    <PortalShell role="investor" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Updates</h1>
      <p className="mt-2 text-sm text-brand-muted">News and announcements from the team.</p>
      <div className="mt-8">
        <UpdatesView role="investor" initialUpdates={updates} />
      </div>
    </PortalShell>
  );
}
