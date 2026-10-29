import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST — one-time password-reset link for a member, to send by hand (WhatsApp etc.)
// when no email is set up. Owner / team:edit_user (admin tag). The link opens
// /reset-password, which redeems it with verifyOtp.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await params;
  if (memberId === user.id) return NextResponse.json({ error: "Use Settings to change your own password" }, { status: 400 });

  const admin = createServiceClient();
  // Caller's tenant, derived from session (service role bypasses RLS, so scope here).
  const { data: caller } = await admin.from("users").select("tenant_id, role").eq("id", user.id).maybeSingle();
  if (!caller?.tenant_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: target } = await admin.from("users").select("role, deleted_at, tenant_id").eq("id", memberId).maybeSingle();
  if (!target || target.deleted_at || target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  // The link signs in as the target, so an admin must never get one for an owner.
  if (target.role === "owner" && caller.role !== "owner") {
    return NextResponse.json({ error: "Cannot reset the owner's password" }, { status: 403 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(memberId);
  const email = authUser?.user?.email;
  if (!email) return NextResponse.json({ error: "Member has no login email" }, { status: 400 });

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${siteUrl}/reset-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
  return NextResponse.json({ link });
}
