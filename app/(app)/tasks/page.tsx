import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TasksClient from "./TasksClient";

const TASK_SELECT =
  "id, user_id, title, tag, status, completed, completed_at, due_date, " +
  "assigned_by, accepted_at, started_at, submitted_at, review_status, " +
  "reviewed_by, reviewed_at, created_at, updated_at";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // Everyone keeps a personal task list; holders of tasks:assign additionally get
  // the assign + review surface. The page is no longer team_member-only, so an
  // owner/PM can reach it — nobody who could open it before loses access.
  const { data: canAssign } = await supabase.rpc("has_capability", {
    p_capability: "tasks:assign",
  });

  // A user with neither a personal list nor assign rights has nothing here.
  if (profile?.role !== "team_member" && !canAssign) redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [{ data: own }, assignedRes, reviewRes, membersRes] = await Promise.all([
    sb
      .from("member_tasks")
      .select(TASK_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    canAssign
      ? sb
          .from("member_tasks")
          .select(TASK_SELECT)
          .eq("assigned_by", user.id)
          .neq("user_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    canAssign
      ? sb
          .from("member_tasks")
          .select(TASK_SELECT)
          .eq("status", "pending_review")
          .order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    canAssign
      ? sb
          .from("users")
          .select("id, full_name, role")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("full_name")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <TasksClient
      initialTasks={own ?? []}
      initialAssigned={assignedRes.data ?? []}
      initialReview={reviewRes.data ?? []}
      members={(membersRes.data ?? []).filter(
        (m: { id: string }) => m.id !== user.id
      )}
      canAssign={!!canAssign}
    />
  );
}
