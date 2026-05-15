import { AuthShell } from '@/components/ui/AuthShell';
import { ForgotForm } from './ForgotForm';

export const dynamic = 'force-dynamic';

export default function ForgotPage() {
  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your email and we'll send a reset link if an account exists."
    >
      <ForgotForm />
    </AuthShell>
  );
}
