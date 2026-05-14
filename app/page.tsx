import Link from 'next/link';
import { BRANDING } from '@/lib/config/branding';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-sm uppercase tracking-[0.2em] text-brand-muted">
        {BRANDING.orgShortName}
      </p>
      <h1 className="mt-4 text-5xl font-normal text-brand-fg">
        {BRANDING.orgName}
      </h1>
      <p className="mt-4 text-lg text-brand-muted">{BRANDING.tagline}</p>

      <div className="mt-12 flex gap-4">
        <Link
          href="/portal"
          className="rounded-md bg-brand-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90"
        >
          Investor portal
        </Link>
        <Link
          href="/room"
          className="rounded-md border border-brand-line px-5 py-3 text-sm font-medium text-brand-fg hover:bg-white"
        >
          Data room
        </Link>
      </div>

      <p className="mt-16 text-xs text-brand-muted">
        New portal {BRANDING.features.newPortalEnabled ? 'enabled' : 'disabled — legacy serving'}
      </p>
    </main>
  );
}
