import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchTaskUpdateEntries } from "@/lib/updates/taskEntries";
import CalendarClient from "./CalendarClient";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth(); // 0-based

  const startOf  = new Date(year, month, 1).toISOString();
  const endOf    = new Date(year, month + 1, 1).toISOString();

  const [eventsRes, updatesRes, profileRes] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, description, starts_at, ends_at, visibility, source_type, project_id, enquiry_id, customer_id, assigned_user_id")
      .gte("starts_at", startOf)
      .lt("starts_at", endOf)
      .order("starts_at", { ascending: true }),
    supabase
      .from("updates")
      .select(`id, update_type, body, author_role_on_project, created_at, project_id,
        users:author_id (id, full_name, role),
        projects:project_id (id, name)`)
      .gte("created_at", startOf)
      .lt("created_at", endOf)
      .order("created_at", { ascending: false }),
    supabase.from("users").select("tenant_id").eq("id", user.id).single(),
  ]);

  // Project-linked tasks join the same feed as the project's own update stream —
  // see fetchTaskUpdateEntries for why this needs the service client.
  const taskEntries = profileRes.data?.tenant_id
    ? await fetchTaskUpdateEntries(profileRes.data.tenant_id, startOf, endOf)
    : [];

  return (
    <CalendarClient
      initial={eventsRes.data ?? []}
      initialUpdates={[...(updatesRes.data ?? []), ...taskEntries]}
      initialYear={year}
      initialMonth={month}
      todayYear={year}
      todayMonth={month}
      todayDate={now.getDate()}
    />
  );
}
