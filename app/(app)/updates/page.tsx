import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "../PageHeader";
import UpdatesClient, { type UpdateRow } from "./UpdatesClient";

export const metadata = { title: "Updates — ArchitectOS" };

type SearchParams = Promise<{ month?: string; from?: string; to?: string }>;

function startOfMonthIso(year: number, monthIdx: number): string {
  return new Date(Date.UTC(year, monthIdx, 1)).toISOString();
}

function endOfMonthIso(year: number, monthIdx: number): string {
  return new Date(Date.UTC(year, monthIdx + 1, 1) - 1).toISOString();
}

function parseDateInput(s: string | undefined, fallbackIso: string, endOfDay: boolean): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallbackIso;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return `${s}${suffix}`;
}

export default async function UpdatesPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const todayYear = now.getUTCFullYear();
  const todayMonth = now.getUTCMonth();

  // Resolve range:
  // - explicit from/to wins
  // - otherwise month=YYYY-MM
  // - default: current month
  const hasCustomRange = Boolean(params.from || params.to);
  const selectedMonth = !hasCustomRange
    ? (params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}`)
    : null;

  let fromIso: string;
  let toIso: string;
  if (hasCustomRange) {
    const defaultFrom = startOfMonthIso(todayYear, todayMonth);
    const defaultTo = endOfMonthIso(todayYear, todayMonth);
    fromIso = parseDateInput(params.from, defaultFrom, false);
    toIso = parseDateInput(params.to, defaultTo, true);
  } else {
    const [y, m] = (selectedMonth as string).split("-").map(Number);
    fromIso = startOfMonthIso(y, m - 1);
    toIso = endOfMonthIso(y, m - 1);
  }

  const { data } = await supabase
    .from("updates")
    .select(`id, update_type, body, created_at, project_id,
      users:author_id (full_name),
      projects:project_id (name)`)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(500);

  // Project-linked tasks join the same feed, exactly as they do on a project's
  // own stream: work in progress shows as pending, and the same task row becomes
  // its completed entry once it closes.
  //
  // Read through the service client for the same reason the project feed does —
  // member_tasks RLS shows a plain member only their own rows, which would give
  // each viewer a different feed. Scoped to the caller's tenant below, and only
  // to tasks that already name a project.
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  let taskRows: unknown[] = [];
  if (profile?.tenant_id) {
    const { data: rows } = await createServiceClient()
      .from("member_tasks")
      .select(`id, title, status, completed, completed_at, created_at, project_id,
        users:user_id (full_name),
        projects:project_id (name)`)
      .eq("tenant_id", profile.tenant_id)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    taskRows = rows ?? [];
  }

  type TaskRow = {
    id: string; title: string; status: string | null; completed: boolean;
    completed_at: string | null; created_at: string; project_id: string;
    users: { full_name: string } | { full_name: string }[] | null;
    projects: { name: string } | { name: string }[] | null;
  };

  const taskEntries: UpdateRow[] = (taskRows as TaskRow[])
    .map((t) => {
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
    // The task query cannot use the same range filter as `updates` (which
    // timestamp applies depends on state), so the range is applied here.
    .filter((e) => e.created_at >= fromIso && e.created_at <= toIso);

  const updates = [...((data ?? []) as UpdateRow[]), ...taskEntries]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="All Updates"
        subtitle={`${updates.length} update${updates.length === 1 ? "" : "s"}`}
      />
      <UpdatesClient
        updates={updates}
        nowMs={now.getTime()}
        selectedMonth={selectedMonth}
        fromDate={params.from ?? ""}
        toDate={params.to ?? ""}
        todayYear={todayYear}
        todayMonth={todayMonth}
      />
    </div>
  );
}
