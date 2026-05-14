import { NextResponse, type NextRequest } from 'next/server';
import { BRANDING } from './lib/config/branding';

/**
 * Lightweight route gating. The session cookie is verified server-side in
 * page/route handlers via `getCurrentSession()`. Middleware here just:
 *   1. Short-circuits /portal/* away from Next.js when the new portal is
 *      disabled (legacy /api/portal/* keeps serving via Vercel rewrites).
 *   2. Lets everything else fall through to Next.
 *
 * Heavier role gating happens in the route group layouts because middleware
 * can't import Node-only crypto on the Edge runtime by default.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  if (!BRANDING.features.newPortalEnabled && url.pathname.startsWith('/portal')) {
    // Rewrite to legacy serverless dispatcher under /api/portal/*
    const rest = url.pathname.replace(/^\/portal\/?/, '');
    const target = rest ? `/api/portal/${rest}` : '/api/portal/index';
    return NextResponse.rewrite(new URL(target, url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portal/:path*'],
};
