import crypto from 'node:crypto';
import { readJson, mutateJson } from './json-store';

export interface Notification {
  id: string;
  userEmail: string;
  kind: 'message' | 'update' | 'envelope' | 'system';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsFile {
  items: Notification[];
  updatedAt: string | null;
}

const FILENAME = 'notifications.json';
const empty = (): NotificationsFile => ({ items: [], updatedAt: null });
const MAX_RETAINED = 500;

export async function loadNotifications(): Promise<NotificationsFile> {
  return readJson<NotificationsFile>(FILENAME, empty());
}

export async function updateNotifications(
  mutator: (f: NotificationsFile) => NotificationsFile | Promise<NotificationsFile>
): Promise<NotificationsFile> {
  return mutateJson<NotificationsFile>(FILENAME, empty(), async (f) => {
    const next = await mutator(f);
    // Cap retention so the file doesn't grow unbounded.
    if (next.items.length > MAX_RETAINED) {
      next.items = next.items.slice(-MAX_RETAINED);
    }
    next.updatedAt = new Date().toISOString();
    return next;
  }, { description: 'In-portal notifications queue. Auto-maintained.' });
}

export async function createNotification(input: Omit<Notification, 'id' | 'createdAt' | 'readAt'>) {
  const item: Notification = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    readAt: null,
    ...input,
  };
  await updateNotifications((f) => {
    f.items.push(item);
    return f;
  });
  return item;
}

export function notificationsFor(file: NotificationsFile, email: string): Notification[] {
  const lower = email.toLowerCase();
  return file.items
    .filter((n) => n.userEmail.toLowerCase() === lower)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
