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

// A task shown in the project stream. `created_at` carries whichever timestamp
// the entry sorts on: completed_at once it is done, else the task's own
// created_at, so both entry kinds sort on one field.
//
// `task_state` is what the feed renders: work still in progress shows as
// pending and is replaced by the completed entry when the task closes.
type TaskEntry = {
  id: string;
  entry_kind: "task";
  task_state: "pending" | "completed";
  title: string;
  tag: string;
  review_status: string | null;
  created_at: string;
  users: { id: string; full_name: string; role: string } | null;
};

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
    .select(`id, update_type, body, author_role_on_project, created_at, edited_at,
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

  // Completed tasks linked to this project appear in the stream alongside real
  // updates. Merged at read time — nothing is written into `updates`, so a task
  // keeps exactly one home row and stays editable from the tasks pages.
  // Skipped when the caller is filtering by update_type or author, since neither
  // filter has a meaningful equivalent on a task row.
  let tasks: TaskEntry[] = [];
  if (!type && !author) {
    // Read through the service client, NOT the caller's. member_tasks RLS shows a
    // plain member only their own rows (tenant-wide reads need
    // daily_tasks:view_all, which only the project_manager tag carries), so the
    // caller's client would show each member a different, mostly-empty feed.
    // Granting that capability broadly would expose every member's private todos
    // app-wide; this stays narrow instead — only tasks already linked to THIS
    // project and only completed ones, behind the explicit access check below.
    //
    // The `updates` query above is NOT that check: updates_select (021) returns
    // zero rows both for a caller with no access AND for a project that simply
    // has no updates yet, so an empty result proves nothing. Re-test the same
    // predicate the policy uses before reading anything with elevated rights.
    const { data: mayRead } = await supabase.rpc("has_capability", {
      p_capability: "progress:view",
      p_project_id: project_id,
    });
    if (!mayRead) {
      const { data: assigned } = await supabase
        .from("project_assignments")
        .select("id")
        .eq("project_id", project_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!assigned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The service client bypasses RLS, so the tenant predicate that
    // owner_view_member_tasks would normally apply has to be written out here.
    const { data: callerProfile } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    const callerTenant = callerProfile?.tenant_id;
    if (!callerTenant) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

    const taskClient = createServiceClient();
    // Both halves of a task's life appear here: work in progress shows as a
    // pending entry, and the same task's completed entry replaces it once it
    // closes (a task has one row, so it yields exactly one entry either way).
    let taskQuery = taskClient
      .from("member_tasks")
      .select("id, title, tag, status, completed, completed_at, created_at, review_status, users:user_id (id, full_name, role)")
      .eq("project_id", project_id)
      .eq("tenant_id", callerTenant)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Range filters apply to whichever timestamp the entry sorts on, so a
    // pending task is filtered by when it was raised rather than a completed_at
    // it does not have yet.
    if (from) taskQuery = taskQuery.or(`completed_at.gte.${from},and(completed_at.is.null,created_at.gte.${from})`);
    if (to) taskQuery = taskQuery.or(`completed_at.lte.${to},and(completed_at.is.null,created_at.lte.${to})`);

    // RLS decides visibility: a member sees their own rows, and holders of
    // daily_tasks:view_all see the whole tenant. A failure here must not take
    // the whole feed down — the updates half is the primary content.
    const { data: taskRows } = await taskQuery;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tasks = ((taskRows ?? []) as any[]).map((t) => {
      // `completed` is the settled flag; a project-linked task sitting in
      // pending_review is still work in progress, not a completed entry.
      const done = t.status === "completed" || (t.completed && t.status !== "pending_review");
      return {
        id: t.id,
        entry_kind: "task" as const,
        task_state: (done ? "completed" : "pending") as "pending" | "completed",
        title: t.title,
        tag: t.tag,
        review_status: t.review_status,
        created_at: (done ? t.completed_at : null) ?? t.created_at,
        users: t.users,
      };
    });
  }

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
      return { ...rest, entry_kind: "update" as const, images: images.filter((i) => i.url) };
    })
  );

  // One stream, newest first. Re-limited after the merge so the response never
  // exceeds the caller's limit now that two sources feed it.
  const entries = [...updates, ...tasks]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);

  // `updates` is kept for existing callers that read it directly.
  return NextResponse.json({ updates, entries });
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
