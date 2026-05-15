import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/ui/AuthShell';
import { getCurrentSession } from '@/lib/auth/session';
import { SigninForm } from './SigninForm';

export const dynamic = 'force-dynamic';

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentSession();
  const sp = await searchParams;
  if (session) {
    redirect(sp.next || (session.role === 'admin' ? '/portal/admin' : '/portal/dashboard'));
  }
  return (
    <AuthShell title="Sign in" subtitle="Use the email and password tied to your investor account.">
      <SigninForm next={sp.next} />
      <p className="mt-6 text-center text-xs text-brand-muted">
        <Link href="/portal/forgot" className="underline-offset-2 hover:underline">
          Forgot your password?
        </Link>
      </p>
    </AuthShell>
  );
}
