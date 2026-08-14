import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TasksClient from "./TasksClient";

const TASK_SELECT =
  "id, user_id, title, tag, status, completed, completed_at, due_date, project_id, " +
  "assigned_by, accepted_at, started_at, submitted_at, review_status, " +
  "reviewed_by, reviewed_at, review_requested_to, created_at, updated_at";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // Whoever supervises the firm's work sees the whole of it: their assign tab is
  // not "tasks I personally handed out" but every task in the tenant, and their
  // review queue is everything outstanding rather than only what was addressed
  // to them. This is a widened VIEW, not widened rights: the rows were already
  // readable through owner_view_member_tasks (038, gated on daily_tasks:view_all)
  // and reviewable through owner_review_tasks (095) — the page was simply
  // filtering them out. Anyone else keeps the narrower, personal scope.
  //
  // Gated on the capability, not role = "owner": per CLAUDE.md this surface is
  // capability-gated, so the owner reaches it by holding the capability rather
  // than by being the owner, and it can be delegated through the access matrix
  // without a code change. Note that daily_tasks:view_all — not this one — is
  // what admits the rows at the RLS layer, so grant both together or the tab
  // renders empty; 104 does exactly that.
  const { data: canViewAllTasks } = await supabase.rpc("has_capability", {
    p_capability: "member_tasks:view_all",
  });
  const seesAllTasks = !!canViewAllTasks;

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

  const [{ data: own }, assignedRes, reviewRes, membersRes, projectsRes] = await Promise.all([
    sb
      .from("member_tasks")
      .select(TASK_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    canAssign
      ? (seesAllTasks
          // Everyone's work, self-set rows included — the supervisor's view of
          // the firm. Their own tasks are excluded because those are the "My
          // tasks" tab; showing them twice would double-count the header figures.
          ? sb
              .from("member_tasks")
              .select(TASK_SELECT)
              .neq("user_id", user.id)
              .order("created_at", { ascending: false })
          : sb
              .from("member_tasks")
              .select(TASK_SELECT)
              .eq("assigned_by", user.id)
              .neq("user_id", user.id)
              .order("created_at", { ascending: false }))
      : Promise.resolve({ data: [] }),
    canAssign
      ? (seesAllTasks
          // A firm-wide viewer is the fallback reviewer for everything, so they
          // see the whole queue — including work addressed to someone else, which
          // the card labels rather than hides. Never their own submissions: 086
          // and the PATCH route both reject self-review, so those rows would only
          // render a button that 403s.
          ? sb
              .from("member_tasks")
              .select(TASK_SELECT)
              .eq("status", "pending_review")
              .neq("user_id", user.id)
              .order("submitted_at", { ascending: false })
          : sb
              .from("member_tasks")
              .select(TASK_SELECT)
              .eq("status", "pending_review")
              .neq("user_id", user.id)
              .or(`review_requested_to.eq.${user.id},and(review_requested_to.is.null,assigned_by.eq.${user.id})`)
              .order("submitted_at", { ascending: false }))
      : Promise.resolve({ data: [] }),
    // Fetched for EVERYONE, not just assign-holders: a plain member needs this
    // to see who assigned their task. Without it `memberName[assigned_by]` was
    // empty and the card read a bare "Assigned" with no name. Only id/name/role,
    // and `users` RLS is tenant-scoped, so this discloses nothing a member
    // cannot already see on the team page.
    sb
      .from("users")
      .select("id, full_name, role")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name"),
    // Every active project in the tenant — both task pickers list all of them.
    sb
      .from("projects")
      .select("id, name")
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(200),
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
      isOwner={seesAllTasks}
      currentUserId={user.id}
      projects={projectsRes.data ?? []}
    />
  );
}
