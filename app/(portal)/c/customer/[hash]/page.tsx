import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Portal — ArchitectOS" };

type Checkpoint = {
  name: string;
  sequence_order: number;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
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

export default async function CustomerPortalPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  const supabase = await createClient();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent") || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_customer_portal_summary", {
    p_hash: hash,
    p_ip: ip,
    p_user_agent: userAgent,
    p_request_id: null,
  });

  if (error || !data) notFound();
  const summary = data as Summary;

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
    <div style={{ minHeight: "100vh", background: "var(--color-paper-light)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, lineHeight: 1.1, marginBottom: 4 }}>
          {summary.customer_name}
        </div>
        <div style={{ color: "var(--color-tan)", fontSize: 13, marginBottom: 28 }}>
          Customer portal · {summary.projects.length} project{summary.projects.length !== 1 ? "s" : ""}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
          <SummaryTile label="Total Billed" value={fmt(totalBilled)} />
          <SummaryTile label="Received" value={fmt(totalReceived)} tone="forest" />
          <SummaryTile label="Outstanding" value={fmt(totalOutstanding)} tone="rust" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {summary.projects.map(p => {
            const projTotal = p.payments.reduce((s, x) => s + Number(x.amount_due), 0);
            const projReceived = p.payments.filter(x => x.is_paid).reduce((s, x) => s + Number(x.amount_due), 0);
            const completed = p.checkpoints.filter(c => c.status === "complete").length;
            const total = p.checkpoints.length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <div key={p.id} style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>
                      {p.current_stage ?? "—"} · {p.status}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600 }}>{fmt(projReceived)} / {fmt(projTotal)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Received / Billed</div>
                  </div>
                </div>
                <div style={{ height: 4, background: "var(--color-line)", borderRadius: 2, marginBottom: 14 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-forest)", borderRadius: 2 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
                  <Stat label="Start" value={p.start_date ?? "—"} />
                  <Stat label="Expected End" value={p.expected_end_date ?? "—"} />
                  <Stat label="Progress" value={`${completed} / ${total} (${pct}%)`} />
                </div>
              </div>
            );
          })}
          {summary.projects.length === 0 && (
            <div style={{ color: "var(--color-tan)", fontSize: 14, padding: 30, textAlign: "center" }}>
              No projects linked.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "forest" | "rust" }) {
  const color = tone === "forest" ? "var(--color-forest)" : tone === "rust" ? "var(--color-rust)" : "var(--color-ink)";
  return (
    <div style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}
