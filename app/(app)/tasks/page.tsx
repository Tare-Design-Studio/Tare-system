import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // Only team members have personal tasks
  if (profile?.role !== "team_member") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("member_tasks")
    .select("id, title, completed, completed_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <TasksClient initialTasks={data ?? []} />;
}
