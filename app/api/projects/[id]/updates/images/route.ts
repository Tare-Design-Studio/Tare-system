import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { pushMediaAssetToDrive, prunePrivateMedia } from "@/lib/drive/sync";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif",
};

type Ctx = { params: Promise<{ id: string }> };

// Uploads a site image to media-private and creates a media_assets row.
// Used by Team Members and Site Engineers when posting an update with photos.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canUpload } = await supabase.rpc("has_capability", {
    p_capability: "images:upload",
    p_project_id: project_id,
  });
  if (!canUpload) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image exceeds 10 MB" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });

  const service = createServiceClient();

  // Confirm the uploader is assigned to the project (mirrors media_assets RLS).
  const { data: assignment } = await service
    .from("project_assignments")
    .select("id")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Forbidden — project is not assigned to you" }, { status: 403 });

  // Site engineers post site images; team members post drawings.
  const { data: profile } = await service
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const kind = profile?.role === "site_engineer" ? "site_image" : "drawing";

  const ext = EXT[file.type] ?? "jpg";
  const storage_path = `${project_id}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await service.storage
    .from("media-private")
    .upload(storage_path, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Compressed derivative for the customer portal. The original stays as the
  // archive copy that goes to Drive; this is what a client's phone downloads.
  // Deliberately best-effort: a conversion failure leaves webp_path NULL and
  // the portal falls back to the original, so a bad EXIF header or an exotic
  // colour profile degrades quality instead of failing the upload.
  let webp_path: string | null = null;
  try {
    const webpBytes = await sharp(bytes)
      .rotate() // honour EXIF orientation before stripping it
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    const candidate = `${project_id}/webp/${crypto.randomUUID()}.webp`;
    const { error: webpErr } = await service.storage
      .from("media-private")
      .upload(candidate, webpBytes, { contentType: "image/webp", upsert: false });
    if (!webpErr) webp_path = candidate;
  } catch {
    // Intentionally swallowed — see above.
  }

  const { data, error } = await service
    .from("media_assets")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      project_id,
      storage_path,
      webp_path,
      bucket: "media-private",
      kind,
      uploaded_by: user.id,
    } as any)
    .select("id, storage_path, bucket")
    .single();

  if (error) {
    await service.storage
      .from("media-private")
      .remove(webp_path ? [storage_path, webp_path] : [storage_path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Push to the project's Google Drive folder. Non-blocking: a Drive failure
  // is recorded on the row (drive_sync_status='failed') but never fails the
  // upload — the image is already safe in Supabase and retryable from the UI.
  const drive = await pushMediaAssetToDrive((data as { id: string }).id);

  // Drive is the permanent archive; Supabase keeps only the 15 newest per kind.
  // Only synced rows are pruned, so an un-synced image is never lost.
  await prunePrivateMedia(project_id, kind);

  return NextResponse.json(
    { data: { ...data, drive_sync_status: drive.status } },
    { status: 201 },
  );
}
