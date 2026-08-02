import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_SECONDS = 60;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — ample for 60s of compressed speech
const ALLOWED = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"]);
const EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3",
  "audio/ogg": "ogg", "audio/wav": "wav",
};

// POST /api/broadcasts/voice — post a voice broadcast (client request #6).
//
// The 60-second ceiling is enforced here AND by a CHECK constraint on
// owner_broadcasts.voice_duration_s (091). The browser's MediaRecorder cutoff
// is a convenience; a caller can post whatever duration they like, so the
// limit has to live server-side to actually mean anything.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canBroadcast } = await supabase.rpc("has_capability", { p_capability: "broadcast:create" });
  if (!canBroadcast) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const durationRaw = form?.get("duration_s");
  const body = (form?.get("body") as string | null) ?? "";

  if (!(file instanceof File)) return NextResponse.json({ error: "No audio file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Voice note is too large" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });

  const duration = Number(durationRaw);
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: "Missing recording length" }, { status: 400 });
  }
  // Math.ceil so a 60.4s clip is rejected rather than silently rounded down.
  const durationS = Math.ceil(duration);
  if (durationS > MAX_SECONDS) {
    return NextResponse.json({ error: `Voice notes are capped at ${MAX_SECONDS} seconds` }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const ext = EXT[file.type] ?? "webm";
  const storage_path = `broadcasts/${profile.tenant_id}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await service.storage
    .from("media-private")
    .upload(storage_path, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data, error } = await service
    .from("owner_broadcasts")
    .insert({
      tenant_id: profile.tenant_id,
      author_id: user.id,
      body: body.trim(),
      voice_path: storage_path,
      voice_duration_s: durationS,
    })
    .select()
    .single();

  if (error) {
    // Do not leave an orphaned object in storage if the row insert failed.
    await service.storage.from("media-private").remove([storage_path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// GET /api/broadcasts/voice?path=… — short-lived signed URL for playback.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  // Paths are namespaced by tenant; refuse anything outside the caller's own.
  // Without this a member could sign another tenant's audio by guessing a path.
  //
  // The traversal check is not redundant with the prefix check:
  // "broadcasts/<own-tenant>/../../other/secret.webm" satisfies startsWith and
  // would escape the namespace if the storage layer normalises it. Reject the
  // segment here rather than depending on how the bucket resolves it.
  const isOwnNamespace = path.startsWith(`broadcasts/${profile.tenant_id}/`);
  const hasTraversal = path.split("/").includes("..");
  if (!isOwnNamespace || hasTraversal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const { data, error } = await service.storage
    .from("media-private")
    .createSignedUrl(path, 600);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
