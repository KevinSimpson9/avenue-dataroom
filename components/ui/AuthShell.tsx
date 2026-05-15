import type { ReactNode } from 'react';
import { BRANDING } from '@/lib/config/branding';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-brand-bg">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">
          {BRANDING.orgShortName}
        </p>
        <h1 className="mt-2 font-display text-3xl text-brand-fg">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-brand-muted">{subtitle}</p> : null}
        <div className="mt-8 rounded-xl border border-brand-line bg-white p-6 shadow-sm">
          {children}
        </div>
        <p className="mt-8 text-center text-xs text-brand-muted">{BRANDING.productName}</p>
      </div>
    </main>
  );
}
