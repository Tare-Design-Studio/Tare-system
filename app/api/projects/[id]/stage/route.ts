import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const StageSchema = z.object({
  stage: z.enum(["design", "execution"]),
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canChange } = await supabase.rpc("has_capability", {
    p_capability: "project:change_stage",
  });
  if (!canChange) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = StageSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "stage must be 'design' or 'execution'" },
      { status: 400 }
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .update({
      current_stage: result.data.stage,
      stage_changed_at: new Date().toISOString(),
      stage_changed_by: user.id,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, current_stage, stage_changed_at")
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: error?.message ?? "Stage change failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ project });
}
