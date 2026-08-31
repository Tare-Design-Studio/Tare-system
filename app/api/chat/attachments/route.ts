import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Chat image upload. Same bucket and same sharp/webp derivative as the project
// image route, with two deliberate differences:
//
//   * no Drive push — a phone snap in a DM is not project archive material;
//   * no prunePrivateMedia — it keeps the 15 newest per kind per project and
//     would silently delete conversation history.
//
// That is also why these rows live in chat_attachments rather than
// media_assets, whose project_id is NOT NULL and so cannot hold a DM image.

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const conversation_id = form?.get("conversation_id");
  const file = form?.get("file");

  if (typeof conversation_id !== "string") {
    return NextResponse.json({ error: "conversation_id required" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image exceeds 10 MB" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });

  // Authorization: read the conversation through the caller's own client. RLS
  // returns nothing for a thread they cannot see, so an upload cannot be
  // parked against someone else's DM. This must happen before any storage
  // write — otherwise a stranger could fill the bucket.
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("id, tenant_id")
    .eq("id", conversation_id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const service = createServiceClient();
  const tenant_id = (conv as { tenant_id: string }).tenant_id;

  const ext = EXT[file.type] ?? "jpg";
  const storage_path = `chat/${conversation_id}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await service.storage
    .from("media-private")
    .upload(storage_path, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Best-effort compression, matching the project route: a conversion failure
  // leaves webp_path NULL and the original is served, so a bad EXIF header
  // degrades quality instead of failing the send.
  let webp_path: string | null = null;
  try {
    const webpBytes = await sharp(bytes)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    const candidate = `chat/${conversation_id}/webp/${crypto.randomUUID()}.webp`;
    const { error: webpErr } = await service.storage
      .from("media-private")
      .upload(candidate, webpBytes, { contentType: "image/webp", upsert: false });
    if (!webpErr) webp_path = candidate;
  } catch {
    // Intentionally swallowed — see above.
  }

  const { data, error } = await service
    .from("chat_attachments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      tenant_id,
      uploaded_by: user.id,
      bucket: "media-private",
      storage_path,
      webp_path,
      mime_type: file.type,
      byte_size: file.size,
    } as any)
    .select("id, storage_path, webp_path, mime_type, scan_status")
    .single();

  if (error) {
    // Orphaned objects would otherwise accumulate in a private bucket nobody
    // lists.
    await service.storage
      .from("media-private")
      .remove(webp_path ? [storage_path, webp_path] : [storage_path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
