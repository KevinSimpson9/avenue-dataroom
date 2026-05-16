import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/current-user';
import {
  isVisibleTo,
  loadUpdates,
  updateUpdates,
  type Update,
} from '@/lib/drive/updates';
import { findByEmail, loadRegistry, type InvestorEntry } from '@/lib/drive/registry';
import { createNotification } from '@/lib/drive/notifications';
import { appendAudit } from '@/lib/drive/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  audience: z.union([z.literal('all'), z.array(z.string().email())]).default('all'),
  pinned: z.boolean().default(false),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const file = await loadUpdates();
  const updates =
    session.role === 'admin'
      ? file.updates
      : file.updates.filter((u) => isVisibleTo(u, session.email));
  updates.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return NextResponse.json({ ok: true, updates });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }
  const update: Update = {
    id: crypto.randomUUID(),
    title: parsed.data.title,
    body: parsed.data.body,
    authorEmail: session.email,
    publishedAt: new Date().toISOString(),
    audience: parsed.data.audience,
    pinned: parsed.data.pinned,
  };
  await updateUpdates((f) => {
    f.updates.push(update);
    return f;
  });

  // Notify the audience.
  const registry = await loadRegistry();
  const recipients =
    update.audience === 'all'
      ? registry.entries
          .filter((e): e is InvestorEntry => e.role === 'investor' && !e.deletedAt)
          .map((e) => e.email)
      : (update.audience as string[]).filter((email) => !!findByEmail(registry, email));
  await Promise.all(
    recipients.map((email) =>
      createNotification({
        userEmail: email,
        kind: 'update',
        title: `New update: ${update.title}`,
        body: update.body.slice(0, 240),
        link: `/portal/updates#${update.id}`,
      })
    )
  );

  await appendAudit({
    actorEmail: session.email,
    actorRole: 'admin',
    action: 'update.publish',
    target: update.id,
    meta: { title: update.title, audienceCount: recipients.length },
  });
  return NextResponse.json({ ok: true, update });
}

export async function DELETE(req: Request) {
  const session = await requireAdmin();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await updateUpdates((f) => {
    f.updates = f.updates.filter((u) => u.id !== id);
    return f;
  });
  await appendAudit({
    actorEmail: session.email,
    actorRole: 'admin',
    action: 'update.delete',
    target: id,
  });
  return NextResponse.json({ ok: true });
}
