import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverNowMs } from "@/lib/serverNow";
import SiteEngineerDashboard from "./SiteEngineerDashboard";
import type { SiteVisit } from "./components/shared";
import type { AttendanceLog } from "./components/SiteAttendanceCard";

export default async function SitePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch current user's profile + assigned execution-stage projects
  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch all projects this user is assigned to that are in execution stage
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select(`
      project_id,
      role_on_project,
      projects!inner(
        id, name, slug, site_location, current_stage, status, customer_id,
        site_lat, site_lng, site_geofence_radius_m,
        project_checkpoints(
          id, name, sequence_order, due_date, completed_at,
          checkpoint_items(id, is_complete)
        )
      )
    `)
    .eq("user_id", user.id)
    .is("projects.deleted_at", null);

  const projects = (assignments ?? [])
    .map(a => a.projects as unknown as {
      id: string;
      name: string;
      slug: string;
      site_location: string | null;
      current_stage: string;
      status: string;
      customer_id: string | null;
      site_lat: number | null;
      site_lng: number | null;
      site_geofence_radius_m: number | null;
      project_checkpoints: {
        id: string;
        name: string;
        sequence_order: number;
        due_date: string;
        completed_at: string | null;
        checkpoint_items: { id: string; is_complete: boolean }[];
      }[];
    })
    .filter(Boolean);

  // Today's office attendance row for this engineer.
  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attendance } = await (supabase as any)
    .from("attendance_logs")
    .select("id, work_date, check_in_at, check_out_at, total_minutes, accumulated_minutes, last_check_in_at, check_in_count")
    .eq("user_id", user.id)
    .eq("work_date", today)
    .maybeSingle();

  // Upcoming owner-scheduled site visits for customers of this engineer's projects.
  // Service client bypasses RLS — site engineers lack enquiry:view / customer:view.
  const customerIds = Array.from(
    new Set(projects.map(p => p.customer_id).filter((c): c is string => Boolean(c)))
  );
  const projectsByCustomer = new Map<string, string[]>();
  for (const p of projects) {
    if (!p.customer_id) continue;
    const list = projectsByCustomer.get(p.customer_id) ?? [];
    list.push(p.name);
    projectsByCustomer.set(p.customer_id, list);
  }

  let siteVisits: SiteVisit[] = [];
  if (customerIds.length > 0) {
    const nowIso = new Date().toISOString();
    const { data: visits } = await createServiceClient()
      .from("enquiry_reminders")
      .select("id, remind_at, message, customer_id, customers:customer_id(name)")
      .eq("category", "site_visit")
      .eq("is_done", false)
      .in("customer_id", customerIds)
      .gte("remind_at", nowIso)
      .order("remind_at", { ascending: true })
      .limit(20);

    siteVisits = ((visits ?? []) as unknown as {
      id: string;
      remind_at: string;
      message: string | null;
      customer_id: string;
      customers: { name: string } | { name: string }[] | null;
    }[]).map(v => {
      const cRaw = v.customers;
      const customer_name = Array.isArray(cRaw) ? cRaw[0]?.name ?? null : cRaw?.name ?? null;
      return {
        id: v.id,
        remind_at: v.remind_at,
        message: v.message,
        customer_name,
        project_names: projectsByCustomer.get(v.customer_id) ?? [],
      };
    });
  }

  return (
    <SiteEngineerDashboard
      engineer={{ id: profile.id, name: profile.full_name, role: profile.role }}
      projects={projects}
      nowMs={serverNowMs()}
      todayAttendance={(attendance ?? null) as AttendanceLog | null}
      siteVisits={siteVisits}
    />
  );
}
