'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Notification } from '@/lib/drive/notifications';

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setItems(data.items as Notification[]);
        setUnread(data.unread as number);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-all-read' }),
    });
    refresh();
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative text-xs uppercase tracking-wider text-brand-muted hover:text-brand-fg"
        aria-label="Notifications"
      >
        Inbox
        {unread > 0 ? (
          <span className="absolute -right-3 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-medium text-white">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-brand-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-brand-line px-4 py-2">
            <span className="text-xs uppercase tracking-wider text-brand-muted">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-brand-accent hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 overflow-auto divide-y divide-brand-line">
            {items.length === 0 ? (
              <li className="px-4 py-6 text-center text-xs text-brand-muted">
                You&apos;re all caught up.
              </li>
            ) : (
              items.slice(0, 30).map((n) => (
                <li key={n.id} className={n.readAt ? '' : 'bg-brand-bg/50'}>
                  {n.link ? (
                    <Link href={n.link} className="block px-4 py-3" onClick={() => setOpen(false)}>
                      <NotificationBody n={n} />
                    </Link>
                  ) : (
                    <div className="px-4 py-3">
                      <NotificationBody n={n} />
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NotificationBody({ n }: { n: Notification }) {
  return (
    <>
      <p className="text-xs font-medium text-brand-fg">{n.title}</p>
      {n.body ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-brand-muted">{n.body}</p>
      ) : null}
      <p className="mt-1 text-[10px] uppercase tracking-wider text-brand-muted">
        {new Date(n.createdAt).toLocaleString()}
      </p>
    </>
  );
}
