import StageFeedback from "./StageFeedback";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Portal — ArchitectOS" };

type Checkpoint = {
  id: string;
  name: string;
  sequence_order: number;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_items: number;
  completed_items: number;
  progress_pct: number | null;
  status: "complete" | "in_progress" | "overdue" | "pending";
};
type Payment = {
  milestone_name: string;
  amount_due: number | string;
  due_date: string | null;
  is_paid: boolean;
};
type ProjectSummary = {
  id: string;
  name: string;
  project_type: string | null;
  current_stage: string | null;
  status: string;
  start_date: string | null;
  expected_end_date: string | null;
  checkpoints: Checkpoint[];
  payments: Payment[];
};
type Summary = {
  customer_name: string;
  projects: ProjectSummary[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const CARD: React.CSSProperties = {
  background: "var(--paper)",
  borderRadius: 20,
  boxShadow: "0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)",
  border: "1px solid rgba(30,28,24,.04)",
};

export default async function CustomerPortalPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!hash || hash.length !== 16) notFound();

  const supabase = await createClient();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent") || null;
  const reqId = h.get("x-request-id") || null;

  const { data, error } = await supabase.rpc("get_customer_portal_summary", {
    p_hash: hash,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
    p_request_id: reqId ?? undefined,
  }) as { data: Summary | null; error: unknown };

  if (error || !data) notFound();
  const summary = data;

  const totalBilled = summary.projects.reduce(
    (s, p) => s + p.payments.reduce((ss, x) => ss + Number(x.amount_due), 0),
    0
  );
  const totalReceived = summary.projects.reduce(
    (s, p) => s + p.payments.filter(x => x.is_paid).reduce((ss, x) => ss + Number(x.amount_due), 0),
    0
  );
  const totalOutstanding = totalBilled - totalReceived;

  return (
    <>
      <style>{`
        :root {
          --bg: #F3EFE7; --bg-2: #EDE7DB; --paper: #FBF8F2;
          --ink: #1B1A17; --ink-2: #3A3833; --muted: #8A857B;
          --line: #E2DBCC; --line-2: #D6CDBA;
          --accent: #2D6A4F; --accent-soft: #B7E4C7;
          --mint: #6B8A6E; --amber: #E2A64B; --rust: #C5543B;
        }
        *, *::before, *::after { box-sizing: border-box }
        html, body {
          margin: 0; padding: 0;
          background: var(--bg); color: var(--ink);
          font-family: 'Geist', ui-sans-serif, system-ui;
          -webkit-font-smoothing: antialiased;
        }
        body {
          background:
            radial-gradient(900px 500px at 80% -5%, #D8E2DC 0%, transparent 60%),
            radial-gradient(700px 400px at -10% 110%, #E8DFCC 0%, transparent 55%),
            var(--bg);
          min-height: 100vh;
        }
        .mono { font-family: 'Geist Mono', ui-monospace, monospace; letter-spacing: -.01em }
        .serif { font-family: 'Instrument Serif', serif; letter-spacing: -.01em }
        a { color: inherit; text-decoration: none }
        @media (max-width: 640px) {
          .summary-grid { grid-template-columns: 1fr 1fr !important }
          .summary-grid > div:last-child { grid-column: span 2 }
        }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "max(env(safe-area-inset-top, 0px), 40px) 28px 60px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 80, height: 35, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase", marginTop: 1 }}>Client Portal</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--accent)", background: "rgba(45,106,79,.1)", padding: "3px 8px", borderRadius: 99 }}>
              {summary.projects.length} Project{summary.projects.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: .6, textTransform: "uppercase", marginBottom: 8 }}>
            Customer Portal
          </div>
          <h1 className="serif" style={{ margin: 0, fontSize: 52, lineHeight: 1, fontWeight: 400, letterSpacing: -1.2 }}>
            {summary.customer_name}
          </h1>
        </div>

        {/* Summary cards */}
        {totalBilled > 0 && (
          <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 32 }}>
            <SummaryCard label="Total Billed" value={fmtAmount(totalBilled)} sub="Across all projects" color="var(--ink)" />
            <SummaryCard label="Received" value={fmtAmount(totalReceived)} sub="Payments cleared" color="var(--mint)" />
            <SummaryCard label="Outstanding" value={fmtAmount(totalOutstanding)} sub="Remaining balance" color="var(--amber)" />
          </div>
        )}

        {/* Projects */}
        {summary.projects.map(p => (
          <ProjectCard key={p.id} project={p} portalHash={hash} />
        ))}

        {summary.projects.length === 0 && (
          <div style={{ ...CARD, padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 14, marginBottom: 32 }}>
            No projects linked.
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--muted)", fontSize: 11 }}>
          <span>Powered by <a href="https://ascension-ten.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}>ascension</a></span>
          <span className="mono">/c/customer/{hash}</span>
        </div>

      </div>
    </>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ ...CARD, borderRadius: 18, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function ProjectCard({ project: p, portalHash }: { project: ProjectSummary; portalHash: string }) {
  const projTotal = p.payments.reduce((s, x) => s + Number(x.amount_due), 0);
  const projReceived = p.payments.filter(x => x.is_paid).reduce((s, x) => s + Number(x.amount_due), 0);
  const completed = p.checkpoints.filter(c => c.status === "complete").length;
  const total = p.checkpoints.length;
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{ ...CARD, padding: 24, marginBottom: 20 }}>
      {/* Project header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div>
          <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, lineHeight: 1.1 }}>{p.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .6, marginTop: 6 }}>
            {[p.project_type, p.current_stage?.replace(/_/g, " ")].filter(Boolean).join(" · ") || p.status}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{fmtAmount(projReceived)} / {fmtAmount(projTotal)}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Received / Billed</div>
        </div>
      </div>

      {/* Project meta */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "var(--ink-2)", fontSize: 13, marginBottom: 18 }}>
        {p.start_date && <span>Started: <b>{fmtDate(p.start_date)}</b></span>}
        {p.expected_end_date && <span>Est. completion: <b>{fmtDate(p.expected_end_date)}</b></span>}
      </div>

      {/* Milestones */}
      {total > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Project Milestones
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 100, height: 5, background: "var(--line-2)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${overallPct}%`, background: "var(--accent)", borderRadius: 99, transition: "width .3s" }} />
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{completed}/{total}</span>
            </div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 14, padding: "6px 16px", border: "1px solid var(--line)" }}>
            {p.checkpoints.map((cp, i) => {
              const isActive = cp.status === "in_progress" || cp.status === "overdue";
              return (
                <div key={cp.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: i < p.checkpoints.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: cp.status === "complete" ? "var(--ink)" : isActive ? "var(--accent)" : "var(--bg-2)",
                    border: `2px solid ${cp.status === "complete" ? "var(--ink)" : isActive ? "var(--accent)" : "var(--line-2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {cp.status === "complete" && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: cp.status === "complete" || isActive ? 600 : 400, color: cp.status === "pending" ? "var(--muted)" : "var(--ink)" }}>
                      {cp.name}
                    </div>
                    {cp.total_items > 0 && (
                      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ width: 80, height: 4, background: "var(--line-2)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${cp.progress_pct ?? 0}%`, background: cp.status === "complete" ? "var(--mint)" : "var(--accent)", borderRadius: 99 }} />
                        </div>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                          {cp.completed_items}/{cp.total_items}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: cp.status === "complete" ? "var(--mint)" : isActive ? "var(--accent)" : "var(--muted)" }}>
                    {cp.progress_pct !== null ? `${cp.progress_pct}%` : cp.status === "complete" ? "100%" : "0%"}
                  </span>
                  {cp.status === "complete" && (
                    <div style={{ gridColumn: "2 / -1" }}>
                      <StageFeedback
                        portalHash={portalHash}
                        checkpointId={cp.id}
                        checkpointName={cp.name}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
