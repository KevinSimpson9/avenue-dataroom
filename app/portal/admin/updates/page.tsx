import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { UpdatesView } from '@/components/updates/UpdatesView';
import { loadUpdates } from '@/lib/drive/updates';

export const dynamic = 'force-dynamic';

export default async function AdminUpdatesPage() {
  const session = await requireAdmin('/portal/admin/updates');
  const file = await loadUpdates();
  const updates = [...file.updates].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return (
    <PortalShell role="admin" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Updates</h1>
      <p className="mt-2 text-sm text-brand-muted">
        Publish a news item to all investors. They&apos;ll see it on /portal/updates and
        receive a notification.
      </p>
      <div className="mt-8">
        <UpdatesView role="admin" initialUpdates={updates} />
      </div>
    </PortalShell>
  );
}
