import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/lib/auth/session';
import {
  loadNotifications,
  notificationsFor,
  updateNotifications,
} from '@/lib/drive/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark-read'), ids: z.array(z.string()) }),
  z.object({ action: z.literal('mark-all-read') }),
]);

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const file = await loadNotifications();
  const items = notificationsFor(file, session.email);
  const unread = items.filter((n) => !n.readAt).length;
  return NextResponse.json({ ok: true, items, unread });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const now = new Date().toISOString();
  await updateNotifications((f) => {
    for (const n of f.items) {
      if (n.userEmail.toLowerCase() !== session.email.toLowerCase()) continue;
      if (parsed.data.action === 'mark-all-read') {
        if (!n.readAt) n.readAt = now;
      } else if (parsed.data.ids.includes(n.id)) {
        if (!n.readAt) n.readAt = now;
      }
    }
    return f;
  });
  return NextResponse.json({ ok: true });
}
