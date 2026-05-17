import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteEngineerDashboard from "./SiteEngineerDashboard";

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
        id, name, slug, site_location, current_stage, status,
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

  return (
    <SiteEngineerDashboard
      engineer={{ id: profile.id, name: profile.full_name, role: profile.role }}
      projects={projects}
      nowMs={Date.now()}
    />
  );
}
