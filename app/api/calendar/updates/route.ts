import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchTaskUpdateEntries } from "@/lib/updates/taskEntries";

// GET /api/calendar/updates?month=YYYY-MM
// Returns project updates visible to the current user for the given month,
// merged with project-linked tasks — same feed shape as the initial page load.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");

  let startOf: Date;
  let endOf: Date;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    startOf = new Date(y, m - 1, 1);
    endOf = new Date(y, m, 1);
  } else {
    const now = new Date();
    startOf = new Date(now.getFullYear(), now.getMonth(), 1);
    endOf = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase
      .from("updates")
      .select(`id, update_type, body, author_role_on_project, created_at, project_id,
        users:author_id (id, full_name, role),
        projects:project_id (id, name)`)
      .gte("created_at", startOf.toISOString())
      .lt("created_at", endOf.toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("users").select("tenant_id").eq("id", user.id).single(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const taskEntries = profile?.tenant_id
    ? await fetchTaskUpdateEntries(profile.tenant_id, startOf.toISOString(), endOf.toISOString())
    : [];

  return NextResponse.json([...(data ?? []), ...taskEntries]);
}
