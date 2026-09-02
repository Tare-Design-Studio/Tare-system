import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  project_type: z
    .enum([
      "residential",
      "commercial",
      "industrial",
      "institutional",
      "interior",
      "urban",
      "landscape",
      "other",
    ])
    .optional(),
  status: z
    .enum(["active", "on_hold", "completed"])
    .optional(),
  on_hold_reason: z.string().optional(),
  budget_total: z.number().positive().nullable().optional(),
  design_budget: z.number().nonnegative().nullable().optional(),
  execution_budget: z.number().nonnegative().nullable().optional(),
  estimated_work_hours: z.number().int().positive().nullable().optional(),
  estimated_duration_days: z.number().int().positive().nullable().optional(),
  start_date: z.string().date().nullable().optional(),
  expected_end_date: z.string().date().nullable().optional(),
  actual_start_date: z.string().date().nullable().optional(),
  actual_end_date: z.string().date().nullable().optional(),
  site_location: z.string().max(500).nullable().optional(),
  site_lat: z.number().min(-90).max(90).nullable().optional(),
  site_lng: z.number().min(-180).max(180).nullable().optional(),
  site_geofence_radius_m: z.number().int().min(50).max(2000).nullable().optional(),
  drive_folder_url: z.string().url().nullable().optional(),
  whatsapp_group_url: z.string().url().nullable().optional(),
  share_drive_with_customer: z.boolean().optional(),
  customer_portal_enabled: z.boolean().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  scope: z.enum(["design_only", "design_and_execution"]).optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      project_assignments (
        id, user_id, role_on_project, contribution_pct, assigned_at,
        users ( id, full_name, role, skill_score )
      ),
      project_checkpoints (
        id, name, sequence_order, due_date, completed_at,
        requires_approval, approved_at, approved_by,
        checkpoint_items ( id, description, is_complete )
      )
    `
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canEdit } = await supabase.rpc("has_capability", {
    p_capability: "project:edit",
  });
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = UpdateProjectSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  if (result.data.scope === "design_only") {
    const { data: current } = await supabase
      .from("projects")
      .select("current_stage")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (current?.current_stage === "execution") {
      return NextResponse.json(
        { error: "Cannot mark a project Design Only while it is in the Execution stage" },
        { status: 400 }
      );
    }
  }

  const { data: project, error } = await supabase
    .from("projects")
    .update({ ...result.data, updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, slug, status")
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canDelete } = await supabase.rpc("has_capability", {
    p_capability: "project:delete",
  });
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
