import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "./ScheduleClient";

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const startOf = new Date();
  startOf.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("calendar_events")
    .select("id, title, description, starts_at, ends_at, visibility, source_type, project_id, enquiry_id, customer_id, assigned_user_id")
    .gte("starts_at", startOf.toISOString())
    .order("starts_at", { ascending: true });

  return <ScheduleClient events={data ?? []} />;
}
