import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const VALID_TAGS = ["accountant", "admin", "project_manager"] as const;

const PatchSchema = z.object({
  user_id: z.string().uuid(),
  tag: z.enum(VALID_TAGS).nullable().optional(),
  capabilities: z
    .array(z.object({ capability: z.string().min(1), granted: z.boolean() }))
    .optional(),
});

// GET /api/access-matrix — all members with their tags and capabilities.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", {
    p_capability: "access_control:manage",
  });
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [membersRes, tagsRes, capsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, role, role_label")
      .is("deleted_at", null)
      .order("full_name"),
    supabase.from("team_member_tags").select("user_id, tag"),
    supabase
      .from("user_capabilities")
      .select("user_id, capability, granted, scope_project_id, source"),
  ]);

  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 });

  return NextResponse.json({
    members: membersRes.data ?? [],
    tags: tagsRes.data ?? [],
    capabilities: capsRes.data ?? [],
  });
}

// PATCH /api/access-matrix — update a member's tag and/or capability overrides.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", {
    p_capability: "access_control:manage",
  });
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { user_id, tag, capabilities } = parsed.data;

  // Resolve the target member's tenant + role.
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user_id)
    .single();
  if (!profile) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // --- Tag change -----------------------------------------------------------
  if (tag !== undefined) {
    if (tag !== null && profile.role !== "team_member") {
      return NextResponse.json(
        { error: "Tags can only be assigned to team members" },
        { status: 400 }
      );
    }
    // Clear existing tags, then insert the new one (triggers sync capabilities).
    const { error: delErr } = await db
      .from("team_member_tags")
      .delete()
      .eq("user_id", user_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (tag !== null) {
      const { error: insErr } = await db
        .from("team_member_tags")
        .insert({ user_id, tag, tenant_id: profile.tenant_id, granted_by: user.id });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // --- Per-capability manual overrides --------------------------------------
  if (capabilities && capabilities.length > 0) {
    for (const { capability, granted } of capabilities) {
      if (capability === "access_control:manage") {
        return NextResponse.json(
          { error: "access_control:manage is non-delegable" },
          { status: 400 }
        );
      }
      const { data: existing } = await db
        .from("user_capabilities")
        .select("id, source")
        .eq("user_id", user_id)
        .eq("capability", capability)
        .is("scope_project_id", null)
        .maybeSingle();

      if (granted) {
        if (existing) {
          if (existing.source === "manual") {
            const { error } = await db
              .from("user_capabilities")
              .update({ granted: true })
              .eq("id", existing.id);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          }
          // tag-sourced rows are left to the tag triggers
        } else {
          const { error } = await db.from("user_capabilities").insert({
            tenant_id: profile.tenant_id,
            user_id,
            capability,
            granted: true,
            scope_project_id: null,
            granted_by: user.id,
            source: "manual",
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else if (existing && existing.source === "manual") {
        // Only manual grants are revocable here; tag grants follow the tag.
        const { error } = await db
          .from("user_capabilities")
          .delete()
          .eq("id", existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
