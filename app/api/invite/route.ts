import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/auth/rateLimit";

import { TEAM_MEMBER_CAPABILITIES, SITE_ENGINEER_CAPABILITIES } from "@/lib/auth/capabilities";

const InviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(100),
  role: z.enum(["team_member", "site_engineer"]),
  password: z.string().min(8).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the caller has team:create_user capability
  const { data: canCreate } = await supabase.rpc("has_capability", {
    p_capability: "team:create_user",
  });

  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Throttle invite/email abuse: 20 invites / hour per user.
  const ok = await checkRateLimit({
    kind: "invite",
    identifier: user.id,
    limit: 20,
    windowSeconds: 3600,
    ip: await clientIp(),
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many invitations. Please wait a while and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = InviteSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { email, full_name, role, password } = result.data;

  // Fetch the tenant_id from the inviting user
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = createServiceClient();

  let authUserId: string;

  if (password) {
    // Direct creation with temporary password
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }
    authUserId = createdUser.user.id;
  } else {
    // Send the Supabase invitation email
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/api/auth/callback?next=/accept`,
      data: { full_name, role },
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }
    authUserId = invited.user.id;
  }

  // Create the public.users row
  const { error: upsertError } = await admin.from("users").upsert(
    {
      id: authUserId,
      tenant_id: profile.tenant_id,
      full_name,
      role,
      is_active: !!password, // active immediately if direct creation
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Grant default capabilities based on role
  const defaultCaps = role === "site_engineer" ? SITE_ENGINEER_CAPABILITIES : TEAM_MEMBER_CAPABILITIES;
  const capRows = defaultCaps.map(cap => ({
    user_id: authUserId,
    tenant_id: profile.tenant_id,
    capability: cap,
    granted: true,
  }));

  const { error: capError } = await admin.from("user_capabilities").upsert(capRows, { onConflict: "user_id, capability, scope_project_id" });
  if (capError) {
    console.error("Failed to insert default capabilities:", capError);
  }

  return NextResponse.json({ success: true, userId: authUserId });
}
