import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushMediaAssetToDrive } from "@/lib/drive/sync";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

// Retry pushing a previously-failed image to the project's Drive folder.
// Backs the "Retry Drive sync" button shown on failed thumbnails.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id: project_id, assetId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canUpload } = await supabase.rpc("has_capability", {
    p_capability: "images:upload",
    p_project_id: project_id,
  });
  if (!canUpload) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Confirm the asset belongs to this project before touching it.
  const { data: asset } = await supabase
    .from("media_assets")
    .select("id")
    .eq("id", assetId)
    .eq("project_id", project_id)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const result = await pushMediaAssetToDrive(assetId);
  if (result.status === "failed") {
    return NextResponse.json({ error: result.error ?? "Drive sync failed" }, { status: 502 });
  }

  return NextResponse.json({ data: result });
}
