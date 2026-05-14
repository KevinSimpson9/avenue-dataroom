import { google, type drive_v3 } from 'googleapis';

export type DriveClient = drive_v3.Drive;

let cached: DriveClient | null = null;

export function getDrive(): DriveClient {
  if (cached) return cached;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  const credentials = JSON.parse(key);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  cached = google.drive({ version: 'v3', auth });
  return cached;
}

export function rootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID not configured');
  return id;
}
