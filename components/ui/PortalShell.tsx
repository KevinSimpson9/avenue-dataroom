import Link from 'next/link';
import type { ReactNode } from 'react';
import { BRANDING } from '@/lib/config/branding';
import type { Role } from '@/lib/auth/session';
import { LogoutButton } from './LogoutButton';

interface NavItem {
  href: string;
  label: string;
}

const adminNav: NavItem[] = [
  { href: '/portal/admin', label: 'Dashboard' },
  { href: '/portal/admin/investors', label: 'Investors' },
  { href: '/portal/admin/envelopes', label: 'Envelopes' },
];

const investorNav: NavItem[] = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/documents', label: 'Documents' },
  { href: '/portal/envelopes', label: 'Signing' },
];

export function PortalShell({
  role,
  email,
  children,
}: {
  role: Role;
  email: string;
  children: ReactNode;
}) {
  const nav = role === 'admin' ? adminNav : investorNav;
  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="border-b border-brand-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href={role === 'admin' ? '/portal/admin' : '/portal/dashboard'} className="block">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-muted">
              {BRANDING.orgShortName}
            </p>
            <p className="font-display text-lg text-brand-fg">{BRANDING.productName}</p>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-brand-fg hover:text-brand-accent"
              >
                {item.label}
              </Link>
            ))}
            <span className="hidden text-xs text-brand-muted sm:inline">{email}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
