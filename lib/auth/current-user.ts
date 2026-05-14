import { redirect } from 'next/navigation';
import { getCurrentSession, type Role, type Session } from './session';

export { getCurrentSession };
export type { Session, Role };

/**
 * Require an authenticated session of the given role. Redirects to /portal/signin
 * (with ?next= preserved) if missing or mismatched. For use in server components
 * and route handlers under (admin) / (investor) route groups.
 */
export async function requireRole(role: Role, nextPath?: string): Promise<Session> {
  const session = await getCurrentSession();
  if (!session || session.role !== role) {
    const qs = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
    redirect(`/portal/signin${qs}`);
  }
  return session;
}

export const requireAdmin = (nextPath?: string) => requireRole('admin', nextPath);
export const requireInvestor = (nextPath?: string) => requireRole('investor', nextPath);
