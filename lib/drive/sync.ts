import { createServiceClient } from "@/lib/supabase/service";
import {
  extractFolderId,
  isDriveConfigured,
  uploadToDriveFolder,
} from "@/lib/drive/client";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
};

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// media_assets.kind encodes who uploaded: site engineers post site_image,
// team members post drawing (see updates/images/route.ts).
const KIND_LABEL: Record<string, string> = {
  site_image: "Site Engineer",
  drawing: "Team Member",
  receipt: "Receipt",
  document: "Document",
};

/**
 * Build a human-readable Drive filename: "Project — Role — YYYY-MM-DD HH-MM.ext".
 * Drive allows duplicate names, so the timestamp is for readability, not uniqueness.
 */
function driveFileName(projectName: string, kind: string, createdAt: string, storagePath: string): string {
  const ext = storagePath.split(".").pop()?.toLowerCase() || "jpg";
  const role = KIND_LABEL[kind] ?? "Upload";
  // Pin to IST so the name matches the timestamps shown in-app.
  const d = new Date(createdAt).toLocaleString("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Kolkata",
  });
  // en-CA gives "2026-05-17, 14:30" → "2026-05-17 14-30" (no ":" — Drive-safe).
  const stamp = d.replace(", ", " ").replace(":", "-");
  // Strip characters Drive/filesystems dislike from the project name.
  const safeProject = projectName.replace(/[\\/:*?"<>|]/g, "").trim() || "Project";
  return `${safeProject} — ${role} — ${stamp}.${ext}`;
}

export interface DriveSyncResult {
  status: "synced" | "skipped" | "failed";
  drive_file_id?: string;
  error?: string;
}

/**
 * Push one media_assets row to its project's Google Drive folder and record
 * the outcome on the row. Non-blocking by design — callers ignore failures;
 * a failed row stays in Supabase and can be retried via the retry endpoint.
 *
 * - `skipped`: Drive not configured, or the project has no drive_folder_url.
 * - `failed` : download or Drive upload errored — drive_sync_error is set.
 * - `synced` : uploaded; drive_file_id is set.
 */
export async function pushMediaAssetToDrive(assetId: string): Promise<DriveSyncResult> {
  const service = createServiceClient();

  const { data: asset } = await service
    .from("media_assets")
    .select("id, project_id, storage_path, bucket, kind, created_at")
    .eq("id", assetId)
    .single();

  if (!asset) return { status: "failed", error: "Media asset not found" };

  async function record(result: DriveSyncResult): Promise<DriveSyncResult> {
    await service
      .from("media_assets")
      .update({
        drive_sync_status: result.status,
        drive_file_id: result.drive_file_id ?? null,
        drive_sync_error: result.error ?? null,
        drive_synced_at: result.status === "synced" ? new Date().toISOString() : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .eq("id", assetId);
    return result;
  }

  if (!isDriveConfigured()) return record({ status: "skipped", error: "Drive not configured" });

  const { data: project } = await service
    .from("projects")
    .select("name, drive_folder_url")
    .eq("id", asset.project_id)
    .single();

  const folderId = extractFolderId(project?.drive_folder_url);
  if (!folderId) {
    return record({ status: "skipped", error: "Project has no Drive folder linked" });
  }

  try {
    const { data: blob, error: dlErr } = await service.storage
      .from(asset.bucket)
      .download(asset.storage_path);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? "Storage download failed");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const name = driveFileName(
      project?.name ?? "Project",
      asset.kind,
      asset.created_at,
      asset.storage_path,
    );

    const driveFileId = await uploadToDriveFolder({
      folderId,
      name,
      mimeType: mimeFromPath(asset.storage_path),
      bytes,
    });

    return record({ status: "synced", drive_file_id: driveFileId });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Unknown Drive sync error";
    return record({ status: "failed", error });
  }
}

/**
 * Keep only the `keep` newest media_assets per (project, kind) in Supabase
 * Storage. Older rows are deleted ONLY if already synced to Drive — Drive is
 * the permanent archive, so an un-synced row is never lost. Drive files are
 * left untouched. Safe to call after every upload.
 */
export async function prunePrivateMedia(
  projectId: string,
  kind: string,
  keep = 15,
): Promise<void> {
  const service = createServiceClient();

  const { data: rows } = await service
    .from("media_assets")
    .select("id, storage_path, bucket, drive_sync_status")
    .eq("project_id", projectId)
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  if (!rows || rows.length <= keep) return;

  // Candidates for deletion: everything past the newest `keep`, but only
  // those already safely in Drive.
  const stale = rows
    .slice(keep)
    .filter((r) => r.drive_sync_status === "synced");
  if (stale.length === 0) return;

  // Group storage paths by bucket for batched removal.
  const byBucket = new Map<string, string[]>();
  for (const r of stale) {
    const list = byBucket.get(r.bucket) ?? [];
    list.push(r.storage_path);
    byBucket.set(r.bucket, list);
  }
  for (const [bucket, paths] of byBucket) {
    await service.storage.from(bucket).remove(paths);
  }

  await service
    .from("media_assets")
    .delete()
    .in("id", stale.map((r) => r.id));
}
