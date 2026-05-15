import { NextResponse, type NextRequest } from 'next/server';

/**
 * Currently a no-op. Production safety is provided by vercel.json's `/portal`
 * rewrites, which route to the legacy serverless dispatcher at /api/portal/*.
 * The new Next.js pages under /app/portal/* are only reachable in:
 *   - local `next dev` (vercel.json doesn't apply)
 *   - Vercel previews where we remove the legacy rewrites at cutover
 *
 * Per-page role gating lives in each page via `requireAdmin()` /
 * `requireInvestor()` from lib/auth/current-user.ts.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
