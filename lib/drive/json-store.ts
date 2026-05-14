import { Readable } from 'node:stream';
import { getDrive, rootFolderId, type DriveClient } from './client';

/**
 * Generic concurrency-safe wrapper around a JSON file stored in the portal's
 * Drive root folder. All reads/writes go through here so we can layer retry-
 * on-conflict on top of Drive's `headRevisionId`.
 */

interface FileHandle {
  id: string;
  headRevisionId?: string | null;
}

async function findFile(drive: DriveClient, filename: string): Promise<FileHandle | null> {
  const folderId = rootFolderId();
  const list = await drive.files.list({
    q: `'${folderId}' in parents and name = '${filename}' and trashed = false`,
    fields: 'files(id, name, headRevisionId)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const f = (list.data.files || [])[0];
  if (!f || !f.id) return null;
  return { id: f.id, headRevisionId: f.headRevisionId ?? null };
}

async function readFile<T>(drive: DriveClient, fileId: string, fallback: T): Promise<T> {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  try {
    return typeof res.data === 'string' ? JSON.parse(res.data) : (res.data as T);
  } catch {
    return fallback;
  }
}

async function writeFile(
  drive: DriveClient,
  fileId: string | null,
  filename: string,
  body: string,
  description?: string
): Promise<string> {
  if (fileId) {
    await drive.files.update({
      fileId,
      media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
      supportsAllDrives: true,
    });
    return fileId;
  }
  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [rootFolderId()],
      mimeType: 'application/json',
      description,
    },
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Failed to create ${filename}`);
  return created.data.id;
}

export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  const drive = getDrive();
  const handle = await findFile(drive, filename);
  if (!handle) return fallback;
  return readFile<T>(drive, handle.id, fallback);
}

/**
 * Read, mutate, and write a JSON file with optimistic concurrency.
 * On a `headRevisionId` mismatch we re-read and re-apply the mutator (up to 3x).
 */
export async function mutateJson<T extends object>(
  filename: string,
  fallback: T,
  mutator: (current: T) => T | Promise<T>,
  opts: { description?: string; retries?: number } = {}
): Promise<T> {
  const drive = getDrive();
  const retries = opts.retries ?? 3;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const handle = await findFile(drive, filename);
    const current = handle ? await readFile<T>(drive, handle.id, fallback) : fallback;
    const next = await mutator(structuredClone(current));

    if (handle) {
      // Re-check headRevisionId before writing.
      const recheck = await findFile(drive, filename);
      if (recheck && recheck.headRevisionId && handle.headRevisionId &&
          recheck.headRevisionId !== handle.headRevisionId) {
        if (attempt < retries) continue;
        throw new Error(`Drive write conflict on ${filename} after ${retries} retries`);
      }
    }

    const body = JSON.stringify(next, null, 2);
    await writeFile(drive, handle?.id ?? null, filename, body, opts.description);
    return next;
  }
  throw new Error(`Unreachable: mutateJson(${filename})`);
}
