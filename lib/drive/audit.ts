import crypto from 'node:crypto';
import { readJson, mutateJson } from './json-store';

export interface AuditEntry {
  id: string;
  ts: string;
  actorEmail: string | null;
  actorRole: 'admin' | 'investor' | 'system' | null;
  action: string;
  /** Stable identifier of the thing acted on (e.g. envelope id, investor email). */
  target: string | null;
  meta?: Record<string, unknown>;
}

export interface AuditFile {
  entries: AuditEntry[];
  updatedAt: string | null;
}

const FILENAME = 'audit-log.json';
const empty = (): AuditFile => ({ entries: [], updatedAt: null });
const MAX_RETAINED = 2000;

export async function loadAudit(): Promise<AuditFile> {
  return readJson<AuditFile>(FILENAME, empty());
}

/**
 * Append an audit entry. Best-effort: any failure is swallowed and logged to
 * the server console so audit failures never break the underlying mutation.
 */
export async function appendAudit(
  entry: Omit<AuditEntry, 'id' | 'ts'>
): Promise<void> {
  try {
    await mutateJson<AuditFile>(
      FILENAME,
      empty(),
      (f) => {
        f.entries.push({
          id: crypto.randomUUID(),
          ts: new Date().toISOString(),
          ...entry,
        });
        if (f.entries.length > MAX_RETAINED) {
          f.entries = f.entries.slice(-MAX_RETAINED);
        }
        f.updatedAt = new Date().toISOString();
        return f;
      },
      { description: 'Audit log of portal mutations. Auto-maintained.' }
    );
  } catch (err) {
    console.warn('audit: append failed', err);
  }
}
