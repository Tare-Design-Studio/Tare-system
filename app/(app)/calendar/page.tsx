import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const [eventsRes, updatesRes] = await Promise.all([
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
  ]);

  return (
    <CalendarClient
      initial={eventsRes.data ?? []}
      initialUpdates={updatesRes.data ?? []}
      initialYear={year}
      initialMonth={month}
      todayYear={year}
      todayMonth={month}
      todayDate={now.getDate()}
    />
  );
}
