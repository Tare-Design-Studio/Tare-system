import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const AssignSchema = z.object({
  user_id: z.string().uuid(),
  role_on_project: z.enum([
    "pm",
    "site_engineer",
    "team_member",
    "lead_architect",
    "design_support",
    "drafting",
    "coordination",
  ]),
  contribution_pct: z.number().min(0).max(100).optional(),
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

  const { data: assignments, error } = await supabase
    .from("project_assignments")
    .select(
      `id, role_on_project, contribution_pct, assigned_at,
       users ( id, full_name, role, skill_score )`
    )
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignments });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canAssign } = await supabase.rpc("has_capability", {
    p_capability: "team:assign_to_project",
  });
  if (!canAssign) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = AssignSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { data: assignment, error } = await supabase
    .from("project_assignments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id: id, assigned_by: user.id, ...result.data } as any)
    .select("id, user_id, role_on_project, contribution_pct")
    .single();

  if (error) {
    const msg = error.code === "23505"
      ? "This user already has that role on this project"
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ assignment }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canAssign } = await supabase.rpc("has_capability", {
    p_capability: "team:assign_to_project",
  });
  if (!canAssign) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const assignmentId = searchParams.get("assignment_id");
  if (!assignmentId) {
    return NextResponse.json({ error: "assignment_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("project_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
