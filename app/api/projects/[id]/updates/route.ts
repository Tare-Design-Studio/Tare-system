import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const UpdateSchema = z.object({
  update_type: z.enum(["note", "image", "drawing", "progress", "remark", "material", "expense"]),
  body: z.string().min(1).max(2000).optional(),
  media_asset_ids: z.array(z.string().uuid()).max(10).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const author = url.searchParams.get("author");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  let query = supabase
    .from("updates")
    .select(`id, update_type, body, author_role_on_project, created_at,
      users:author_id (id, full_name, role),
      media_assets:media_assets!linked_update_id (id, storage_path, bucket, drive_sync_status)`)
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("update_type", type);
  if (author) query = query.eq("author_id", author);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sign storage paths so raw keys never reach the browser.
  // Private buckets have no SELECT policy for the authenticated role — sign with
  // the service client (project access was already enforced by the updates query).
  const storageClient = createServiceClient();
  const updates = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).map(async (u: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assets: any[] = u.media_assets ?? [];
      const images = await Promise.all(
        assets.map(async (a) => {
          const { data: signed } = await storageClient.storage
            .from(a.bucket)
            .createSignedUrl(a.storage_path, 600);
          return { id: a.id, url: signed?.signedUrl ?? null, drive_sync_status: a.drive_sync_status };
        })
      );
      const { media_assets, ...rest } = u;
      void media_assets;
      return { ...rest, images: images.filter((i) => i.url) };
    })
  );

  return NextResponse.json({ updates });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Derive role on project from project_assignments
  const { data: assignment } = await supabase
    .from("project_assignments")
    .select("role_on_project")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const author_role_on_project = assignment?.role_on_project ?? "member";

  const { media_asset_ids, ...updateFields } = parsed.data;

  const { data, error } = await supabase
    .from("updates")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, author_id: user.id, author_role_on_project, ...updateFields } as any)
    .select(`id, update_type, body, author_role_on_project, created_at,
      users:author_id (id, full_name, role)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Link any uploaded images to this update (only the uploader's own, same project).
  if (media_asset_ids && media_asset_ids.length > 0) {
    const service = createServiceClient();
    await service
      .from("media_assets")
      .update({ linked_update_id: (data as { id: string }).id })
      .in("id", media_asset_ids)
      .eq("project_id", project_id)
      .eq("uploaded_by", user.id);
  }

  return NextResponse.json({ data }, { status: 201 });
}
