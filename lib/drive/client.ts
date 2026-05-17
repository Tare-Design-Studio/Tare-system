import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";

// Google Drive client backed by user OAuth (refresh-token flow).
// A service account has no Drive storage quota and cannot create files in a
// personal My Drive folder — so the app authenticates as a real Google account.
// Credentials live in .env — never commit them. Obtain the refresh token once
// with: npx tsx scripts/drive-auth.ts
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

let cached: drive_v3.Drive | null = null;

/** True when the OAuth credentials needed for Drive are configured. */
export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

/** Strip a stray surrounding quote pair some editors keep in an .env value. */
function unquote(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// Loopback redirect for the one-time consent flow (scripts/drive-auth.ts).
// Desktop-type OAuth clients only accept a bare loopback origin — no path —
// so this is "http://localhost:<port>", not ".../callback".
export const OAUTH_REDIRECT_PORT = 53682;
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_REDIRECT_PORT}`;

/**
 * Build an OAuth2 client from .env credentials. The refresh token is long-lived;
 * googleapis transparently mints fresh access tokens from it on every call.
 */
export function makeOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client credentials are not configured");
  }
  return new google.auth.OAuth2(
    unquote(clientId),
    unquote(clientSecret),
    OAUTH_REDIRECT_URI,
  );
}

function getDrive(): drive_v3.Drive {
  if (cached) return cached;

  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("Google Drive credentials are not configured");
  }

  const auth = makeOAuthClient();
  auth.setCredentials({ refresh_token: unquote(refreshToken) });

  cached = google.drive({ version: "v3", auth });
  return cached;
}

/**
 * Extract a Drive folder ID from a pasted folder URL or a bare ID.
 * Handles /folders/<id>, ?id=<id>, and plain IDs. Returns null if none found.
 */
export function extractFolderId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  const value = urlOrId.trim();
  if (!value) return null;

  const folders = value.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folders) return folders[1];

  const idParam = value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (idParam) return idParam[1];

  // Bare ID (no slashes, no query) — Drive IDs are URL-safe base64-ish.
  if (/^[A-Za-z0-9_-]{10,}$/.test(value)) return value;

  return null;
}

interface UploadArgs {
  folderId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Upload a file into a Drive folder. Returns the created file's ID. */
export async function uploadToDriveFolder({
  folderId,
  name,
  mimeType,
  bytes,
}: UploadArgs): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(Buffer.from(bytes)) },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error("Drive upload returned no file ID");
  return id;
}
