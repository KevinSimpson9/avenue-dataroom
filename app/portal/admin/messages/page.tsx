import { requireAdmin } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { MessagesView } from '@/components/messages/MessagesView';
import { loadMessages } from '@/lib/drive/messages';
import { loadRegistry, type InvestorEntry } from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  const session = await requireAdmin('/portal/admin/messages');
  const [file, registry] = await Promise.all([loadMessages(), loadRegistry()]);
  const investors = registry.entries
    .filter((e): e is InvestorEntry => e.role === 'investor' && !e.deletedAt)
    .map((i) => ({ email: i.email, name: i.name }));

  return (
    <PortalShell role="admin" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Messages</h1>
      <p className="mt-2 text-sm text-brand-muted">
        Direct messaging with investors. Each thread is visible to admins and the
        investor it&apos;s with.
      </p>
      <div className="mt-8">
        <MessagesView
          role="admin"
          selfEmail={session.email}
          initialThreads={file.threads}
          investorChoices={investors}
        />
      </div>
    </PortalShell>
  );
}
