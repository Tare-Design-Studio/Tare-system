import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Signs a chat image for viewing.
//
// The service client is required to mint a signed URL for the private bucket
// (the anon key cannot — that is the bug the /c/[hash] portal still has), so
// authorization happens first, through the caller's own client: RLS on
// chat_attachments admits the row only to its uploader or to someone who can
// read a message carrying it.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: asset } = await supabase
    .from("chat_attachments")
    .select("id, bucket, storage_path, webp_path, scan_status")
    .eq("id", id)
    .maybeSingle();

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = asset as {
    bucket: string; storage_path: string; webp_path: string | null; scan_status: string;
  };

  // Mirrors media_assets: nothing infected is ever served, whatever the row
  // says elsewhere.
  if (a.scan_status === "infected") {
    return NextResponse.json({ error: "Unavailable" }, { status: 403 });
  }

  const service = createServiceClient();
  const path = a.webp_path ?? a.storage_path;
  const { data, error } = await service.storage
    .from(a.bucket)
    .createSignedUrl(path, 60 * 30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
