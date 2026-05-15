import { Readable } from 'node:stream';
import { getDrive, rootFolderId, type DriveClient } from './client';
import { readJson, mutateJson } from './json-store';
import { BRANDING } from '../config/branding';

/**
 * Authoritative registry of admin + investor accounts. Stored as
 * `investor-registry.json` in the portal root Drive folder, alongside
 * per-investor subfolders. Schema is BYTE-IDENTICAL to the legacy
 * api/_portal-registry.js so the same file works for both apps.
 */

const REGISTRY_FILENAME = 'investor-registry.json';

export interface AdminEntry {
  role: 'admin';
  name: string;
  email: string;
  passwordHash: string | null;
  passwordCreatedAt: string | null;
  resetNonce: string | null;
}

export interface InvestorEntry {
  role: 'investor';
  name: string;
  email: string;
  principal: number;
  rate: string;
  termMonths: number;
  folderId: string | null;
  blankPdfId?: string | null;
  passwordHash: string | null;
  passwordCreatedAt: string | null;
  resetNonce: string | null;
  lukasSignedAt?: string | null;
  lukasSignedPdfId?: string | null;
  signedAt?: string | null;
  signedPdfId?: string | null;
  deletedAt?: string | null;
}

export type Entry = AdminEntry | InvestorEntry;

export interface Registry {
  entries: Entry[];
  updatedAt: string | null;
}

const seedAdmins = (): AdminEntry[] =>
  BRANDING.adminEmails.map((email) => ({
    role: 'admin',
    name: email.split('@')[0],
    email,
    passwordHash: null,
    passwordCreatedAt: null,
    resetNonce: null,
  }));

const emptyRegistry = (): Registry => ({
  entries: seedAdmins(),
  updatedAt: null,
});

export async function loadRegistry(): Promise<Registry> {
  return readJson<Registry>(REGISTRY_FILENAME, emptyRegistry());
}

export async function updateRegistry(
  mutator: (r: Registry) => Registry | Promise<Registry>
): Promise<Registry> {
  return mutateJson<Registry>(REGISTRY_FILENAME, emptyRegistry(), async (r) => {
    const next = await mutator(r);
    next.updatedAt = new Date().toISOString();
    return next;
  }, { description: 'Authoritative investor + admin registry. Auto-maintained.' });
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

export function findByEmail(
  registry: Registry,
  email: string,
  opts: { includeDeleted?: boolean } = {}
): Entry | null {
  const target = normalizeEmail(email);
  if (!target) return null;
  return (
    registry.entries.find((e) => {
      if (!opts.includeDeleted && (e as InvestorEntry).deletedAt) return false;
      return normalizeEmail(e.email) === target;
    }) || null
  );
}

export async function createInvestorFolder(
  drive: DriveClient,
  name: string
): Promise<{ id: string; name: string }> {
  const safe =
    String(name || 'investor')
      .replace(/[^A-Za-z0-9 _.-]+/g, '')
      .trim()
      .slice(0, 80) || 'investor';
  const res = await drive.files.create({
    requestBody: {
      name: safe,
      parents: [rootFolderId()],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, name',
    supportsAllDrives: true,
  });
  return { id: res.data.id!, name: res.data.name! };
}

export async function uploadFile(
  drive: DriveClient,
  folderId: string,
  filename: string,
  mimeType: string,
  bytes: Buffer | Uint8Array
): Promise<{ id: string; name: string }> {
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(Buffer.from(bytes)) },
    fields: 'id, name',
    supportsAllDrives: true,
  });
  return { id: created.data.id!, name: created.data.name! };
}

export async function downloadFile(drive: DriveClient, fileId: string): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  webViewLink?: string;
}

export async function listFolderFiles(
  drive: DriveClient,
  folderId: string
): Promise<DriveFileMeta[]> {
  const out: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, webViewLink)',
      pageSize: 100,
      pageToken,
      orderBy: 'createdTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of list.data.files || []) {
      if (f.id && f.name && f.mimeType && f.createdTime) {
        out.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          createdTime: f.createdTime,
          webViewLink: f.webViewLink || undefined,
        });
      }
    }
    pageToken = list.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

export { getDrive };
