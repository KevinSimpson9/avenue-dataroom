import { AuthShell } from '@/components/ui/AuthShell';
import { verifyToken } from '@/lib/auth/tokens';
import { ChoosePasswordForm } from '../../_components/ChoosePasswordForm';

export const dynamic = 'force-dynamic';

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyToken(token);
  const valid = !!verified && verified.purpose === 'reset';
  return (
    <AuthShell
      title="Reset password"
      subtitle={valid ? 'Choose a new password for your account.' : 'This reset link is no longer valid.'}
    >
      {valid ? (
        <ChoosePasswordForm action="complete-reset" token={token} />
      ) : (
        <p className="text-sm text-brand-muted">
          Reset links can only be used once. Request a fresh one from the sign-in page.
        </p>
      )}
    </AuthShell>
  );
}
