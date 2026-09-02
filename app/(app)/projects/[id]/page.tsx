import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverNowMs } from "@/lib/serverNow";
import { Chip } from "@/components/atoms";
import ProjectTablesSection from "./ProjectTablesSection";
import EditProjectModal from "./EditProjectModal";
import TeamStreamCard from "./TeamStreamCard";
import MilestonesCard from "./MilestonesCard";
import ProgressTimelineClient from "./ProgressTimelineClient";
import { UpdateComposer } from "@/components/updates/UpdateComposer";
import { MaterialPlanCard } from "./MaterialPlanCard";
import styles from "./project-detail.module.css";

type CheckpointStatus = "complete" | "in_progress" | "overdue" | "pending";

type Checkpoint = {
  id: string;
  name: string;
  sequence_order: number;
  due_date: string;
  started_at: string | null;
  completed_at: string | null;
  requires_approval: boolean;
  approved_at: string | null;
  remarks: string | null;
  completion_percentage: number | null;
  checkpoint_items: { id: string; description: string; is_complete: boolean }[];
};

type Assignment = {
  id: string;
  role_on_project: string;
  contribution_pct: number | null;
  users: { id: string; full_name: string; role: string } | null;
};

type Project = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  project_type: string | null;
  current_stage: string;
  scope: string;
  status: string;
  on_hold_reason: string | null;
  budget_total: number | null;
  design_budget: number | null;
  execution_budget: number | null;
  estimated_work_hours: number | null;
  estimated_duration_days: number | null;
  start_date: string | null;
  expected_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  site_location: string | null;
  drive_folder_url: string | null;
  whatsapp_group_url: string | null;
  site_lat: number | null;
  site_lng: number | null;
  site_geofence_radius_m: number | null;
  customer_portal_hash: string | null;
  customer_portal_enabled: boolean;
  is_placeholder: boolean;
  stage_changed_at: string | null;
  project_checkpoints: Checkpoint[];
  project_assignments: Assignment[];
};

function statusTone(status: string): "forest" | "teal" | "amber" | "mint" | "ink" | "rust" {
  switch (status) {
    case "active": return "forest";
    case "on_hold": return "amber";
    case "completed": return "mint";
    default: return "ink";
  }
}

function capitalise(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function checkpointStatus(cp: Checkpoint): CheckpointStatus {
  if (cp.approved_at || cp.completed_at) return "complete";
  if (cp.started_at) return "in_progress";
  if (new Date(cp.due_date) < new Date()) return "overdue";
  return "pending";
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function hoursVariance(estimated: number | null, actual: number): string | null {
  if (!estimated || estimated === 0) return null;
  const pct = ((actual - estimated) / estimated) * 100;
  if (Math.abs(pct) < 5) return "On track";
  return pct > 0 ? `+${pct.toFixed(0)}% over hours` : `${pct.toFixed(0)}% under hours`;
}

function varianceTone(
  estimated: number | null,
  actual: number,
  threshold: number = 25
): "mint" | "amber" | "rust" {
  if (!estimated || estimated === 0) return "mint";
  const pct = Math.abs(((actual - estimated) / estimated) * 100);
  if (pct < 5) return "mint";
  if (pct < threshold) return "amber";
  return "rust";
}

type Ctx = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  // Private storage buckets have no SELECT policy for the authenticated role —
  // sign URLs with the service client (the page already enforces row-level access).
  const storageClient = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select(
      `id, tenant_id, name, slug, project_type, current_stage, scope, status, on_hold_reason,
       budget_total, design_budget, execution_budget, estimated_work_hours, estimated_duration_days,
       start_date, expected_end_date, actual_start_date, actual_end_date,
       site_location, drive_folder_url, whatsapp_group_url, site_lat, site_lng,
       site_geofence_radius_m,
       customer_portal_hash, customer_portal_enabled,
       is_placeholder, stage_changed_at,
       project_checkpoints (
         id, name, sequence_order, due_date, started_at, completed_at,
         requires_approval, approved_at, remarks, completion_percentage,
         checkpoint_items ( id, description, is_complete )
       ),
       project_assignments (
         id, role_on_project, contribution_pct,
         users!user_id ( id, full_name, role )
       )`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!project) notFound();

  const p = project as unknown as Project;

  // Compute actual hours via work_log sum (simple aggregation)
  const { data: profileRes } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const userRole = profileRes?.role ?? "team_member";
  const canViewFinance = userRole === "owner"
    || (await supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" })).data === true;

  // Gate Edit Project button behind project:edit capability (B1)
  const canEditProject = userRole === "owner"
    || (await supabase.rpc("has_capability", { p_capability: "project:edit" })).data === true;

  // Gate checkpoint progression (B1)
  const canProgressCheckpoints = userRole === "owner"
    || (await supabase.rpc("has_capability", { p_capability: "checkpoint:progress" })).data === true;

  // Owner / PM can manage the planned material list
  const canPlanMaterials = userRole === "owner"
    || (await supabase.rpc("has_capability", { p_capability: "materials:plan", p_project_id: id })).data === true;

  // Assigned users (team members / site engineers) can post updates here
  const isAssigned = p.project_assignments.some(a => a.users?.id === user.id);

  // Scope: when the project is design-only, hide all execution / site-engineer cards
  const isExecution = p.scope !== "design_only";

  const [hoursRes, expensesRes, paymentsRes, paymentRecordsRes, tablesRes, canEditTableRes, updatesRes, materialPlanRes, materialConsumptionRes, materialPresetsRes, mediaRes, projectTasksRes] = await Promise.all([
    supabase
      .from("work_log")
      .select("hours")
      .eq("project_id", id)
      .eq("is_corrected", false)
      .is("deleted_at", null),

    supabase
      .from("expenses")
      .select("id, amount, category, description, spent_on, approval_status, recorded_by, users!expenses_recorded_by_fkey(full_name)")
      .eq("project_id", id)
      .eq("is_corrected", false)
      .is("deleted_at", null)
      .order("spent_on", { ascending: false })
      .limit(10),

    supabase
      .from("v_payment_status")
      .select("*")
      .eq("project_id", id)
      .order("sequence_order", { ascending: true }),

    supabase
      .from("payment_records")
      .select("id, payment_schedule_id, amount_paid, paid_on, method, reference, notes")
      .eq("project_id", id)
      .order("paid_on", { ascending: false }),

    supabase
      .from("project_tables")
      .select(`
        id, name, table_owner_role, description, display_order,
        project_table_columns ( id, name, column_kind, display_order, is_required ),
        project_table_sections ( id, name, display_order ),
        project_table_rows ( id, section_id, display_order, cells )
      `)
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("display_order"),

    supabase.rpc("has_capability", { p_capability: "project_table:edit" }),

    supabase
      .from("updates")
      .select(`id, update_type, body, created_at, edited_at, author_id,
        users:author_id (id, full_name, role),
        media_assets:media_assets!linked_update_id (id, storage_path, bucket, drive_sync_status)`)
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("material_plan")
      .select("id, material_name, unit, planned_quantity, planned_for_date, planned_for_week, created_at")
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),

    supabase
      .from("material_consumption")
      .select("material_plan_id, quantity_used, is_corrected")
      .eq("project_id", id)
      .is("deleted_at", null),

    supabase
      .from("material_plan_presets")
      .select("id, name, material_plan_preset_items(id, material_name, unit, planned_quantity, sequence_order)")
      .is("deleted_at", null)
      .order("name"),

    supabase
      .from("media_assets")
      .select("id, storage_path, bucket, kind, created_at")
      .eq("project_id", id)
      .in("kind", ["site_image", "drawing"])
      .order("created_at", { ascending: false })
      .limit(40),

    // Completed tasks linked to this project — shown in the Team Stream beside
    // the updates. Service client because member_tasks RLS shows a plain member
    // only their own rows, which would give each viewer a different feed; the
    // page has already established this user may view this project.
    createServiceClient()
      .from("member_tasks")
      .select("id, title, tag, status, completed, completed_at, created_at, review_status, users:user_id (id, full_name, role)")
      .eq("project_id", id)
      .eq("tenant_id", p.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const actualHours = (hoursRes.data ?? []).reduce((sum, r) => sum + Number(r.hours), 0);
  const expenses = expensesRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentSchedule = (paymentsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentRecords = (paymentRecordsRes.data ?? []) as any[];
  // Updates with signed image URLs for the Team Stream
  const projectUpdates = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((updatesRes.data ?? []) as any[]).map(async (u) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assets: any[] = u.media_assets ?? [];
      const images = await Promise.all(
        assets.map(async (a) => {
          const { data: signed } = await storageClient.storage
            .from(a.bucket)
            .createSignedUrl(a.storage_path, 600);
          return { id: a.id, url: signed?.signedUrl ?? null, drive_sync_status: a.drive_sync_status };
        })
      );
      const { media_assets, ...rest } = u;
      void media_assets;
      return { ...rest, entry_kind: "update" as const, images: images.filter((i) => i.url) };
    })
  );

  // Project-linked tasks join the same stream, newest first. Work in progress
  // shows as a pending entry; once the task closes, the same row becomes its
  // completed entry (one task row = one entry, never both). The timestamp the
  // entry sorts on is mapped onto created_at so one sort key covers both kinds.
  const projectStream = [
    ...projectUpdates,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((projectTasksRes.data ?? []) as any[]).map((t) => {
      // A project-linked task sitting in pending_review is still in progress.
      const done = t.status === "completed" || (t.completed && t.status !== "pending_review");
      return {
        id: t.id,
        entry_kind: "task" as const,
        task_state: (done ? "completed" : "pending") as "pending" | "completed",
        title: t.title,
        tag: t.tag,
        review_status: t.review_status,
        created_at: (done ? t.completed_at : null) ?? t.created_at,
        users: t.users,
        // The stream filters by author_id; for a task that is the member who did it.
        author_id: t.users?.id ?? "",
        update_type: "task",
      };
    }),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectTables = (tablesRes.data ?? []) as any[];
  const canEditTable = !!canEditTableRes.data;

  // Material plan rows with aggregated (non-corrected) consumption
  const consumedByPlan = new Map<string, number>();
  for (const c of (materialConsumptionRes.data ?? [])) {
    if (c.material_plan_id && !c.is_corrected) {
      consumedByPlan.set(c.material_plan_id, (consumedByPlan.get(c.material_plan_id) ?? 0) + Number(c.quantity_used));
    }
  }
  const materialPlan = (materialPlanRes.data ?? []).map((m) => ({
    id: m.id,
    material_name: m.material_name,
    unit: m.unit,
    planned_quantity: Number(m.planned_quantity),
    planned_for_date: m.planned_for_date,
    consumed: consumedByPlan.get(m.id) ?? 0,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materialPresets = ((materialPresetsRes.data ?? []) as any[]).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    itemCount: (p.material_plan_preset_items ?? []).length as number,
  }));

  // Latest Files — site_image (site engineers) vs drawing (team members), signed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mediaAssets = (mediaRes.data ?? []) as any[];
  const signMedia = async (kind: string) =>
    Promise.all(
      mediaAssets
        .filter((m) => m.kind === kind)
        .slice(0, 8)
        .map(async (m) => {
          const { data: signed } = await storageClient.storage
            .from(m.bucket)
            .createSignedUrl(m.storage_path, 600);
          return { id: m.id as string, url: signed?.signedUrl ?? null };
        })
    );
  const [siteImages, drawingImages] = await Promise.all([signMedia("site_image"), signMedia("drawing")]);
  const siteImageCount = mediaAssets.filter((m) => m.kind === "site_image").length;
  const drawingCount = mediaAssets.filter((m) => m.kind === "drawing").length;

  const siteEngineerAssignments = p.project_assignments.filter(
    (a) => a.role_on_project === "site_engineer" || a.users?.role === "site_engineer"
  );

  const expenseTotals = expenses.reduce(
    (acc, e) => { acc[e.approval_status] = (acc[e.approval_status] ?? 0) + Number(e.amount); return acc; },
    {} as Record<string, number>
  );

  const checkpoints = [...p.project_checkpoints].sort(
    (a, b) => a.sequence_order - b.sequence_order
  );
  const totalItems = checkpoints.reduce(
    (n, cp) => n + cp.checkpoint_items.length,
    0
  );
  const completedItems = checkpoints.reduce(
    (n, cp) => n + cp.checkpoint_items.filter((ci) => ci.is_complete).length,
    0
  );
  const overallProgress = totalItems
    ? Math.round((completedItems / totalItems) * 100)
    : checkpoints.length
      ? Math.round(
        (checkpoints.filter((c) => c.completed_at !== null).length / checkpoints.length) * 100
      )
      : 0;

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    color: "var(--color-tan)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 12,
  };

  const variance = hoursVariance(p.estimated_work_hours, actualHours);
  const vTone = varianceTone(p.estimated_work_hours, actualHours);

  const infoRows = ([
    { label: "Stage", value: capitalise(p.current_stage) },
    { label: "Type", value: p.project_type ? capitalise(p.project_type) : null },
    { label: "Start Date", value: formatDate(p.start_date) },
    { label: "Expected End", value: formatDate(p.expected_end_date) },
    canViewFinance ? {
      label: "Budget",
      value: p.budget_total ? `₹${(p.budget_total / 100000).toFixed(1)} L` : null,
    } : null,
    { label: "Est. Hours", value: p.estimated_work_hours ? `${p.estimated_work_hours}h` : null },
    { label: "Est. Duration", value: p.estimated_duration_days ? `${p.estimated_duration_days} days` : null },
    { label: "Location", value: p.site_location },
  ].filter(Boolean) as { label: string; value: string | null }[])
    .filter((r) => r.value !== null && r.value !== "—");

  return (
    <div className={styles.shell}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.titleRow}>
            {userRole !== "site_engineer" && (
              <Link
                href="/projects"
                className={styles.backLink}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </Link>
            )}
            <h1
              className={`font-serif ${styles.title}`}
            >
              {p.name}
            </h1>
            <Chip
              label={capitalise(p.status)}
              tone={statusTone(p.status)}
              dot
            />
          </div>

          <div
            className={styles.metaBar}
          >
            {p.project_type && (
              <span>{capitalise(p.project_type)}</span>
            )}
            {p.site_location && (
              <span>{p.site_location}</span>
            )}
            {(p.start_date || p.expected_end_date) && (
              <span>
                {formatDate(p.start_date)} – {formatDate(p.expected_end_date)}
              </span>
            )}
            {variance && (
              <Chip label={variance} tone={vTone} size="sm" />
            )}
            <Chip
              label={p.current_stage === "execution" ? "Execution Stage" : "Design Stage"}
              tone={p.current_stage === "execution" ? "teal" : "indigo"}
              size="sm"
            />
          </div>
        </div>

        <div className={styles.actions}>
          {canEditProject && (
            <EditProjectModal project={p} milestones={canViewFinance ? paymentSchedule : []} paymentRecords={canViewFinance ? paymentRecords : []} checkpoints={checkpoints} />
          )}
          {p.whatsapp_group_url && (
            <a
              href={p.whatsapp_group_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.actionLink}`}
              style={{ background: "#25D366", color: "#fff", borderColor: "#25D366" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.083-1.116L4 20l1.116-3.917A8 8 0 1112 20z" />
              </svg>
              WhatsApp
            </a>
          )}
          {p.drive_folder_url && (
            <a
              href={p.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.actionLink} ${styles.driveLink}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Drive
            </a>
          )}
        </div>
      </div>

      {/* on_hold banner */}
      {p.status === "on_hold" && p.on_hold_reason && (
        <div className={styles.holdBanner}>
          <strong>On hold:</strong> {p.on_hold_reason}
        </div>
      )}

      {/* Main 8/4 grid */}
      <div className={styles.mainGrid}>
        {/* Left column */}
        <div className={styles.column}>

          {/* Pipelines */}
          <div className={styles.card}>
            <div className={styles.sectionTitle} style={{ marginBottom: 24 }}>
              Project Pipelines
            </div>

            {/* Checkpoint timeline */}
            {checkpoints.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ ...sectionLabel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Progress Timeline</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{overallProgress}% complete</span>
                </div>
                <ProgressTimelineClient checkpoints={checkpoints} nowMs={serverNowMs()} />
              </div>
            )}

            {/* Project Duration & Progress (B4 — replaces Hours Logged) */}
            {(() => {
              const startDate = p.start_date ? new Date(p.start_date) : null;
              const endDate = p.expected_end_date ? new Date(p.expected_end_date) : null;
              const today = new Date();
              const msPerDay = 86400000;

              const estimatedDays = startDate && endDate
                ? Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)
                : p.estimated_duration_days ?? null;

              const daysCompleted = startDate
                ? Math.max(0, Math.round((today.getTime() - startDate.getTime()) / msPerDay))
                : null;

              const completedCheckpoints = checkpoints.filter(c => c.completed_at || c.approved_at).length;
              const progressPct = checkpoints.length > 0 ? completedCheckpoints / checkpoints.length : 0;
              const projectedEnd = startDate && progressPct > 0 && daysCompleted
                ? new Date(startDate.getTime() + (daysCompleted / progressPct) * msPerDay)
                : null;

              return (
                <div style={{ marginBottom: 24 }}>
                  <div style={sectionLabel}>Project Duration & Progress</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                    <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Estimated</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, marginTop: 2 }}>
                        {estimatedDays !== null ? `${estimatedDays} days` : "—"}
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Days Elapsed</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, marginTop: 2, color: estimatedDays && daysCompleted && daysCompleted > estimatedDays ? "var(--color-rust)" : "inherit" }}>
                        {daysCompleted !== null ? `${daysCompleted} days` : "—"}
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Projected End</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: projectedEnd ? 14 : 18, fontWeight: 600, marginTop: 2, color: projectedEnd && endDate && projectedEnd > endDate ? "var(--color-rust)" : projectedEnd ? "var(--color-forest)" : "inherit" }}>
                        {projectedEnd ? projectedEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  {estimatedDays && daysCompleted !== null ? (
                    <div style={{ height: 8, background: "var(--color-line)", borderRadius: 99, position: "relative", overflow: "hidden" }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${Math.min((daysCompleted / estimatedDays) * 100, 100)}%`,
                        background: daysCompleted > estimatedDays ? "var(--color-rust)" : "var(--color-forest)",
                        borderRadius: 99,
                      }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--color-tan)", fontStyle: "italic" }}>
                      Set start and end dates to track duration
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Payment Milestones */}
            {canViewFinance && (
              <MilestonesCard
                key={paymentSchedule.map(m => `${m.schedule_id}:${m.amount_received}:${m.is_paid}`).join("|")}
                projectId={id}
                initialSchedule={paymentSchedule}
                paymentRecords={paymentRecords}
                canEdit={canViewFinance}
              />
            )}
          </div>

          {/* Team Stream — directly below Project Pipelines */}
          <div className={styles.card}>
            <TeamStreamCard assignments={p.project_assignments} updates={projectStream} projectId={id} currentUserId={user.id} />
          </div>

          {/* Post an update — assigned team members / site engineers */}
          {isAssigned && (
            <div className={styles.card} style={{ padding: 16 }}>
              <UpdateComposer projectId={id} compact />
            </div>
          )}

          {/* Material Plan */}
          {isExecution && (materialPlan.length > 0 || canPlanMaterials) && (
            <div className={styles.card}>
              <MaterialPlanCard
                projectId={id}
                initialRows={materialPlan}
                canEdit={canPlanMaterials}
                presets={materialPresets}
              />
            </div>
          )}

        </div>

        {/* Right sidebar */}
        <div className={styles.column}>



          {/* Project info */}
          <div className={styles.card}>
            <div className={styles.cardHeading} style={{ marginBottom: 16 }}>
              Project Info
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {infoRows.map((row) => (
                <div
                  key={row.label}
                  className={styles.infoRow}
                >
                  <span style={{ color: "var(--color-tan)" }}>{row.label}</span>
                  <span className={styles.infoValue}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expense Summary */}
          {isExecution && (
          <div className={styles.card}>
            <div className={styles.cardHeading} style={{ marginBottom: 16 }}>Expense Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 12, background: "var(--color-bg)", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Approved</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                  ₹{(expenseTotals["approved"] ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div style={{ padding: 12, background: "var(--color-bg)", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Pending</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, marginTop: 4, color: (expenseTotals["pending"] ?? 0) > 0 ? "var(--color-amber)" : "inherit" }}>
                  ₹{(expenseTotals["pending"] ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
            <Link href={`/projects/${id}/expenses`} style={{ display: "block", width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--color-line)", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", color: "var(--color-ink)" }}>
              View Detailed Breakdown
            </Link>
          </div>
          )}

          {/* Latest Files */}
          <div className={styles.card}>
            <div className={styles.cardHeading} style={{ marginBottom: 16 }}>Latest Files</div>
            {([
              { label: "Site Images", images: siteImages, total: siteImageCount, empty: "No site images uploaded by site engineers yet." },
              { label: "Drawings", images: drawingImages, total: drawingCount, empty: "No drawings uploaded by team members yet." },
            ] as const).map((group) => (
              <div key={group.label} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                  <span>{group.label}</span>
                  {group.total > 0 && (
                    <span style={{ color: "var(--color-tan)", fontSize: 12 }}>{group.total} total</span>
                  )}
                </div>
                {group.images.filter(im => im.url).length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--color-tan)", fontStyle: "italic" }}>{group.empty}</div>
                ) : (
                  <div className={styles.imageGrid} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                    {group.images.filter(im => im.url).map(im => (
                      <a key={im.id} href={im.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ display: "block", aspectRatio: "1/1", borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-line)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url ?? ""} alt={group.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {p.drive_folder_url ? (
              <a href={p.drive_folder_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "10px", borderRadius: 10, background: "var(--color-bg)", fontSize: 12, fontWeight: 600, textDecoration: "none", color: "var(--color-ink)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                Open Drive Folder
              </a>
            ) : (
              <button disabled style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "10px", borderRadius: 10, background: "var(--color-bg)", fontSize: 12, fontWeight: 600, border: "none", color: "var(--color-tan)", cursor: "not-allowed" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                Open Drive Folder
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Execution Tables — full-width below the two-column grid (hidden when design-only) */}
      {isExecution && (
      <div style={{ paddingBottom: 40 }}>
        <ProjectTablesSection
          projectId={p.id}
          initialTables={projectTables}
          canEdit={canEditTable}
          siteEngineers={siteEngineerAssignments}
        />
      </div>
      )}
    </div>
  );
}
