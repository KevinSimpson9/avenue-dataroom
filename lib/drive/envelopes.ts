import { readJson, mutateJson } from './json-store';
import { getDrive, rootFolderId, type DriveClient } from './client';

/**
 * Generic signing envelope: one source PDF + N recipients + M fields. Not tied
 * to any specific document type. Schema byte-identical to legacy
 * api/_envelopes-registry.js so the same file works for both apps.
 */

const FILENAME = 'envelopes.json';
const ENVELOPES_FOLDER_NAME = 'Envelopes';

export type EnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'partially-signed'
  | 'executed'
  | 'voided';

export type FieldType = 'signature' | 'initials' | 'date' | 'text';

export interface Recipient {
  id: string;
  email: string;
  name: string;
  role: string;
  order: number;
  signNonce: string;
  invitedAt: string | null;
  signedAt: string | null;
  signedIp: string | null;
  signedUserAgent: string | null;
}

export interface Field {
  id: string;
  recipientId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  status: 'confirmed';
  defaultValue: string | null;
  filledValue: string | null;
  filledAt: string | null;
}

export interface Envelope {
  id: string;
  title: string;
  status: EnvelopeStatus;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  executedAt: string | null;
  sourcePdfId: string;
  sourcePdfName: string;
  sourcePdfSha256: string;
  executedPdfId: string | null;
  destinationFolderId: string;
  enforceOrder: boolean;
  ccAdmin: boolean;
  recipients: Recipient[];
  fields: Field[];
}

export interface EnvelopesFile {
  envelopes: Envelope[];
  envelopesFolderId: string | null;
  updatedAt: string | null;
}

const empty = (): EnvelopesFile => ({
  envelopes: [],
  envelopesFolderId: null,
  updatedAt: null,
});

export async function loadEnvelopes(): Promise<EnvelopesFile> {
  return readJson<EnvelopesFile>(FILENAME, empty());
}

export async function updateEnvelopes(
  mutator: (f: EnvelopesFile) => EnvelopesFile | Promise<EnvelopesFile>
): Promise<EnvelopesFile> {
  return mutateJson<EnvelopesFile>(
    FILENAME,
    empty(),
    async (f) => {
      const next = await mutator(f);
      next.updatedAt = new Date().toISOString();
      return next;
    },
    {
      description:
        'Generic signing envelopes for the portal. Auto-maintained.',
    }
  );
}

export function findEnvelope(file: EnvelopesFile, id: string): Envelope | null {
  return file.envelopes.find((e) => e.id === id) || null;
}

export function findRecipient(env: Envelope, recipientId: string): Recipient | null {
  return env.recipients.find((r) => r.id === recipientId) || null;
}

/**
 * Lazy-create the shared `Envelopes/` Drive folder used as the destination
 * fallback when no recipient is a known investor. The id is cached on
 * envelopesFolderId in the file so we don't re-search Drive every request.
 *
 * NOTE: This mutates `file` in place — only call inside an `updateEnvelopes`
 * mutator or be careful to persist the change yourself.
 */
export async function getOrCreateEnvelopesFolder(
  drive: DriveClient,
  file: EnvelopesFile
): Promise<string> {
  if (file.envelopesFolderId) return file.envelopesFolderId;
  const list = await drive.files.list({
    q: `'${rootFolderId()}' in parents and name = '${ENVELOPES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let folderId = (list.data.files || [])[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name: ENVELOPES_FOLDER_NAME,
        parents: [rootFolderId()],
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    folderId = created.data.id!;
  }
  file.envelopesFolderId = folderId;
  return folderId;
}

export function canRecipientSignNow(env: Envelope, recipient: Recipient): boolean {
  if (env.status !== 'sent' && env.status !== 'partially-signed') return false;
  if (recipient.signedAt) return false;
  if (!env.enforceOrder) return true;
  return env.recipients.every(
    (r) =>
      r.id === recipient.id ||
      (r.order || 0) >= (recipient.order || 0) ||
      !!r.signedAt
  );
}

export function pickLowestOrderRecipient(env: Envelope): Recipient | null {
  const pending = env.recipients.filter((r) => !r.signedAt);
  if (!pending.length) return null;
  pending.sort((a, b) => (a.order || 0) - (b.order || 0));
  return pending[0];
}

export { getDrive };
