import { readJson, mutateJson } from './json-store';

export interface Update {
  id: string;
  title: string;
  body: string;
  authorEmail: string;
  publishedAt: string;
  /** `"all"` or a list of investor emails. */
  audience: 'all' | string[];
  pinned: boolean;
}

export interface UpdatesFile {
  updates: Update[];
  updatedAt: string | null;
}

const FILENAME = 'updates.json';
const empty = (): UpdatesFile => ({ updates: [], updatedAt: null });

export async function loadUpdates(): Promise<UpdatesFile> {
  return readJson<UpdatesFile>(FILENAME, empty());
}

export async function updateUpdates(
  mutator: (f: UpdatesFile) => UpdatesFile | Promise<UpdatesFile>
): Promise<UpdatesFile> {
  return mutateJson<UpdatesFile>(FILENAME, empty(), async (f) => {
    const next = await mutator(f);
    next.updatedAt = new Date().toISOString();
    return next;
  }, { description: 'Admin-authored updates feed. Auto-maintained.' });
}

export function isVisibleTo(update: Update, email: string): boolean {
  if (update.audience === 'all') return true;
  return update.audience.some((a) => a.toLowerCase() === email.toLowerCase());
}
