import { readJson, mutateJson } from './json-store';

export interface Message {
  id: string;
  fromEmail: string;
  fromRole: 'admin' | 'investor';
  body: string;
  sentAt: string;
  readByInvestor: boolean;
  readByAdmin: boolean;
}

export interface Thread {
  id: string;
  investorEmail: string;
  subject: string;
  createdAt: string;
  messages: Message[];
}

export interface MessagesFile {
  threads: Thread[];
  updatedAt: string | null;
}

const FILENAME = 'messages.json';
const empty = (): MessagesFile => ({ threads: [], updatedAt: null });

export async function loadMessages(): Promise<MessagesFile> {
  return readJson<MessagesFile>(FILENAME, empty());
}

export async function updateMessages(
  mutator: (f: MessagesFile) => MessagesFile | Promise<MessagesFile>
): Promise<MessagesFile> {
  return mutateJson<MessagesFile>(FILENAME, empty(), async (f) => {
    const next = await mutator(f);
    next.updatedAt = new Date().toISOString();
    return next;
  }, { description: 'Admin ↔ investor messaging threads. Auto-maintained.' });
}
