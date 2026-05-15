import { AuthShell } from '@/components/ui/AuthShell';
import { verifyToken } from '@/lib/auth/tokens';
import { ChoosePasswordForm } from '../../_components/ChoosePasswordForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyToken(token);
  const valid = !!verified && verified.purpose === 'setup';
  return (
    <AuthShell
      title="Choose a password"
      subtitle={valid ? 'This is your first time signing in.' : 'This setup link is no longer valid.'}
    >
      {valid ? (
        <ChoosePasswordForm action="complete-setup" token={token} />
      ) : (
        <p className="text-sm text-brand-muted">
          Setup links are single-use and expire once a password is chosen. Ask the admin to
          resend a fresh link.
        </p>
      )}
    </AuthShell>
  );
}
