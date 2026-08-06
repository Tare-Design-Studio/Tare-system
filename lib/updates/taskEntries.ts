import { createServiceClient } from "@/lib/supabase/service";

export interface TaskUpdateEntry {
  id: string;
  update_type: "task_pending" | "task_completed";
  body: string | null;
  created_at: string;
  project_id: string;
  users: { full_name: string } | null;
  projects: { name: string } | null;
}

type TaskRow = {
  id: string; title: string; status: string | null; completed: boolean;
  completed_at: string | null; created_at: string; project_id: string;
  users: { full_name: string } | null;
  projects: { name: string } | null;
};

/**
 * Project-linked tasks (member_tasks with a project_id), reshaped as feed
 * entries alongside the `updates` table — same merge /updates/page.tsx does,
 * shared here so the calendar's Updates card sees the same data.
 *
 * Reads through the service client because member_tasks RLS shows a plain
 * member only their own rows, which would give each viewer a different feed;
 * scoped to the caller's tenant instead. Filtered to [fromIso, toIso] here
 * since which timestamp applies (created_at vs completed_at) depends on state.
 */
export async function fetchTaskUpdateEntries(
  tenantId: string,
  fromIso: string,
  toIso: string
): Promise<TaskUpdateEntry[]> {
  const { data: rows } = await createServiceClient()
    .from("member_tasks")
    .select(`id, title, status, completed, completed_at, created_at, project_id,
      users:user_id (full_name),
      projects:project_id (name)`)
    .eq("tenant_id", tenantId)
    .not("project_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  return ((rows ?? []) as TaskRow[])
    .map((t): TaskUpdateEntry => {
      // A project-linked task sitting in pending_review is still in progress.
      const done = t.status === "completed" || (t.completed && t.status !== "pending_review");
      const at = (done ? t.completed_at : null) ?? t.created_at;
      return {
        id: `task-${t.id}`,
        update_type: done ? "task_completed" : "task_pending",
        body: t.title,
        created_at: at,
        project_id: t.project_id,
        users: t.users,
        projects: t.projects,
      };
    })
    .filter((e) => e.created_at >= fromIso && e.created_at <= toIso);
}
