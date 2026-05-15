'use client';

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout' }),
        });
        window.location.href = '/portal/signin';
      }}
      className="text-xs uppercase tracking-wider text-brand-muted hover:text-brand-fg"
    >
      Sign out
    </button>
  );
}
