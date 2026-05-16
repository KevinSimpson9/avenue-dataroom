import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/lib/auth/session';
import {
  loadMessages,
  updateMessages,
  type Message,
  type Thread,
} from '@/lib/drive/messages';
import {
  findByEmail,
  loadRegistry,
  normalizeEmail,
} from '@/lib/drive/registry';
import { createNotification } from '@/lib/drive/notifications';
import { appendAudit } from '@/lib/drive/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    investorEmail: z.string().email(),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(8000),
  }),
  z.object({
    action: z.literal('reply'),
    threadId: z.string(),
    body: z.string().min(1).max(8000),
  }),
  z.object({
    action: z.literal('mark-read'),
    threadId: z.string(),
  }),
]);

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const file = await loadMessages();
  const threads =
    session.role === 'admin'
      ? file.threads
      : file.threads.filter(
          (t) => t.investorEmail.toLowerCase() === session.email.toLowerCase()
        );
  threads.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.sentAt || a.createdAt;
    const bLast = b.messages[b.messages.length - 1]?.sentAt || b.createdAt;
    return bLast.localeCompare(aLast);
  });
  return NextResponse.json({ ok: true, threads });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }
  const data = parsed.data;

  if (data.action === 'create') {
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, message: 'Admins create threads.' }, { status: 403 });
    }
    const registry = await loadRegistry();
    const inv = findByEmail(registry, data.investorEmail);
    if (!inv || inv.role !== 'investor') {
      return NextResponse.json({ ok: false, message: 'Investor not found.' }, { status: 404 });
    }
    const thread: Thread = {
      id: crypto.randomUUID(),
      investorEmail: inv.email,
      subject: data.subject,
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: crypto.randomUUID(),
          fromEmail: session.email,
          fromRole: 'admin',
          body: data.body,
          sentAt: new Date().toISOString(),
          readByAdmin: true,
          readByInvestor: false,
        },
      ],
    };
    await updateMessages((f) => {
      f.threads.push(thread);
      return f;
    });
    await createNotification({
      userEmail: inv.email,
      kind: 'message',
      title: `New message: ${thread.subject}`,
      body: data.body.slice(0, 240),
      link: `/portal/messages?thread=${thread.id}`,
    });
    await appendAudit({
      actorEmail: session.email,
      actorRole: 'admin',
      action: 'message.create',
      target: inv.email,
      meta: { threadId: thread.id, subject: thread.subject },
    });
    return NextResponse.json({ ok: true, thread });
  }

  if (data.action === 'reply') {
    let createdMsg: Message | null = null;
    let threadInvestorEmail: string | null = null;
    let subject = '';
    await updateMessages((f) => {
      const t = f.threads.find((x) => x.id === data.threadId);
      if (!t) return f;
      if (
        session.role === 'investor' &&
        normalizeEmail(t.investorEmail) !== normalizeEmail(session.email)
      ) {
        return f;
      }
      const msg: Message = {
        id: crypto.randomUUID(),
        fromEmail: session.email,
        fromRole: session.role,
        body: data.body,
        sentAt: new Date().toISOString(),
        readByAdmin: session.role === 'admin',
        readByInvestor: session.role === 'investor',
      };
      t.messages.push(msg);
      createdMsg = msg;
      threadInvestorEmail = t.investorEmail;
      subject = t.subject;
      return f;
    });
    if (!createdMsg || !threadInvestorEmail) {
      return NextResponse.json({ ok: false, message: 'Thread not found.' }, { status: 404 });
    }
    // Notify the other side.
    const isFromAdmin = session.role === 'admin';
    const notifyTarget = isFromAdmin
      ? (threadInvestorEmail as string)
      : 'ADMIN_FANOUT';
    if (notifyTarget !== 'ADMIN_FANOUT') {
      await createNotification({
        userEmail: notifyTarget,
        kind: 'message',
        title: `Reply: ${subject}`,
        body: data.body.slice(0, 240),
        link: `/portal/messages?thread=${data.threadId}`,
      });
    } else {
      // investor replied — notify all admins
      const registry = await loadRegistry();
      const admins = registry.entries.filter((e) => e.role === 'admin');
      await Promise.all(
        admins.map((a) =>
          createNotification({
            userEmail: a.email,
            kind: 'message',
            title: `Reply from ${session.email}: ${subject}`,
            body: data.body.slice(0, 240),
            link: `/portal/admin/messages?thread=${data.threadId}`,
          })
        )
      );
    }
    await appendAudit({
      actorEmail: session.email,
      actorRole: session.role,
      action: 'message.reply',
      target: threadInvestorEmail,
      meta: { threadId: data.threadId },
    });
    return NextResponse.json({ ok: true });
  }

  // mark-read
  await updateMessages((f) => {
    const t = f.threads.find((x) => x.id === data.threadId);
    if (!t) return f;
    if (
      session.role === 'investor' &&
      normalizeEmail(t.investorEmail) !== normalizeEmail(session.email)
    ) {
      return f;
    }
    for (const m of t.messages) {
      if (session.role === 'admin') m.readByAdmin = true;
      else m.readByInvestor = true;
    }
    return f;
  });
  return NextResponse.json({ ok: true });
}
