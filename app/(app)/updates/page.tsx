import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../PageHeader";

export const metadata = { title: "Updates — ArchitectOS" };

type UpdateRow = {
  id: string;
  update_type: string;
  body: string | null;
  created_at: string;
  project_id: string;
  users: { full_name: string } | { full_name: string }[] | null;
  projects: { name: string } | { name: string }[] | null;
};

function updateIcon(updateType: string): string {
  switch (updateType) {
    case "progress": return "M20 6 9 17l-5-5";
    case "note": return "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8";
    case "material_request": return "m12 2 10 6-10 6L2 8z|m2 14 10 6 10-6";
    case "site_photo": return "M3 3h18v18H3z|M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3|m21 15-5-5L5 21";
    case "payment": return "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6";
    case "check_in": return "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z|M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
    default: return "M12 20h9|M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z";
  }
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} mins`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? "s" : ""}`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)} days`;
}

function capitaliseType(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default async function UpdatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("updates")
    .select(`id, update_type, body, created_at, project_id,
      users:author_id (full_name),
      projects:project_id (name)`)
    .order("created_at", { ascending: false })
    .limit(200);

  const updates = (data ?? []) as UpdateRow[];

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="All Updates"
        subtitle={`${updates.length} update${updates.length === 1 ? "" : "s"}`}
        actions={<Link href="/" style={{ fontSize: 12, color: "var(--color-tan)", textDecoration: "none" }}>← Back to overview</Link>}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, maxWidth: 880 }}>
        {updates.length === 0 ? (
          <div style={{ color: "var(--color-tan)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            No updates yet.
          </div>
        ) : updates.map((e) => {
          const authorRaw = e.users;
          const author = Array.isArray(authorRaw) ? authorRaw[0]?.full_name : authorRaw?.full_name;
          const projectRaw = e.projects;
          const projectName = Array.isArray(projectRaw) ? projectRaw[0]?.name : projectRaw?.name;
          const isMint = e.update_type === "payment";
          const title = e.body?.split("\n")[0]?.slice(0, 80) || capitaliseType(e.update_type);
          const sub = [projectName, author].filter(Boolean).join(" · ");

          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 12, alignItems: "flex-start" }}>
              <div style={{ paddingTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>
                {timeAgo(e.created_at)}
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 14,
                background: isMint ? "#D6E0CF" : "#EAE3D3",
                color: isMint ? "#3E5A41" : "var(--color-ink)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {updateIcon(e.update_type).split("|").map((p, j) => <path key={j} d={p} />)}
                  </svg>
                  {title}
                </div>
                {sub && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
                {e.body && e.body.split("\n").length > 1 && (
                  <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                    {e.body.split("\n").slice(1).join("\n")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
