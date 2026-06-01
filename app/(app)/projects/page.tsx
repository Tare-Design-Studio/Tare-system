import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serverNowMs } from "@/lib/serverNow";
import { Card, Icon } from "@/components/atoms";
import NewProjectModal from "./NewProjectModal";
import { PageHeader } from "../PageHeader";
import ProjectsClient from "./ProjectsClient";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  project_type: string | null;
  current_stage: string;
  scope: string;
  status: string;
  start_date: string | null;
  expected_end_date: string | null;
  estimated_work_hours: number | null;
  project_checkpoints: { completed_at: string | null }[];
  project_assignments: { users: { full_name: string } | null }[];
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: canViewAll } = await supabase.rpc("has_capability", {
    p_capability: "project:view_all",
  });
  const { data: canCreate } = await supabase.rpc("has_capability", {
    p_capability: "project:create",
  });

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select(
      `id, name, slug, project_type, current_stage, scope, status,
       start_date, expected_end_date, estimated_work_hours,
       project_checkpoints ( completed_at ),
       project_assignments ( user_id, users!user_id ( full_name ) )`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = (projects ?? []) as unknown as ProjectRow[];
  const activeCount = rows.filter(p => p.status === "active").length;

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Projects"
        subtitle={`${rows.length} total · ${activeCount} active`}
        actions={
          <>
            <button style={{
              padding: "10px 18px", borderRadius: 12, fontSize: 13, fontWeight: 500,
              background: "var(--color-paper-light)", color: "var(--color-ink)",
              border: "1px solid var(--line-2)", boxShadow: "0 1px 0 #FFF inset",
              cursor: "pointer"
            }}>Export</button>
            {canCreate && <NewProjectModal />}
          </>
        }
      />

      {projectsError ? (
        <Card style={{ padding: 32, background: "#FFF0EE", border: "1px solid #F0C9BE" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-rust)", marginBottom: 8 }}>
            Failed to load projects
          </div>
          <pre style={{ fontSize: 12, color: "var(--color-rust)", margin: 0, whiteSpace: "pre-wrap" }}>
            {projectsError.message}
          </pre>
        </Card>
      ) : rows.length === 0 ? (
        <Card style={{ padding: 60, textAlign: "center", background: "var(--color-paper-light)" }}>
          <div style={{ display: "inline-flex", padding: 20, borderRadius: "50%", background: "var(--color-paper)", marginBottom: 20 }}>
            <Icon name="briefcase" size={32} style={{ opacity: 0.2 }} />
          </div>
          <div
            style={{ fontSize: 20, fontWeight: 600, color: "var(--color-ink)", marginBottom: 8 }}
          >
            No projects yet
          </div>
          <p style={{ fontSize: 14, color: "var(--color-tan)", maxWidth: 300, margin: "0 auto" }}>
            Get started by creating your first project to manage your workflow.
          </p>
        </Card>
      ) : (
        <ProjectsClient initialProjects={rows} nowMs={serverNowMs()} />
      )}
    </div>
  );
}

