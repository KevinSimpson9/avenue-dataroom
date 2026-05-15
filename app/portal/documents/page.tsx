import { requireInvestor } from '@/lib/auth/current-user';
import { PortalShell } from '@/components/ui/PortalShell';
import { DocumentList } from '@/components/documents/DocumentList';
import {
  findByEmail,
  getDrive,
  listFolderFiles,
  loadRegistry,
  type InvestorEntry,
} from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const session = await requireInvestor('/portal/documents');
  const registry = await loadRegistry();
  const entry = findByEmail(registry, session.email) as InvestorEntry | null;

  const files =
    entry?.folderId ? await listFolderFiles(getDrive(), entry.folderId) : [];

  return (
    <PortalShell role="investor" email={session.email}>
      <h1 className="font-display text-3xl text-brand-fg">Documents</h1>
      <p className="mt-2 text-sm text-brand-muted">
        Files shared with you by the team.
      </p>
      <div className="mt-8">
        <DocumentList files={files} />
      </div>
    </PortalShell>
  );
}
