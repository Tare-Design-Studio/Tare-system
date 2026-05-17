import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../PageHeader";
import { ExpensesBreakdownClient } from "./ExpensesBreakdownClient";
import { ExpenseApproval } from "./ExpenseApproval";

export const metadata = { title: "Project Expenses — ArchitectOS" };

export default async function ProjectExpensesPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  const { from, to } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: canView } = await supabase.rpc("has_capability", { p_capability: "expenses:view" });
  if (!canView) redirect("/");

  const { data: canApprove } = await supabase.rpc("has_capability", { p_capability: "expenses:approve" });

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const fromDate = from || monthStart;
  const toDate = to || today;

  const [expensesRes, consumptionRes] = await Promise.all([
    db
      .from("expenses")
      .select("id, amount, category, description, spent_on, approval_status, recorded_by, linked_material_plan_id, users:recorded_by(full_name), material_plan:linked_material_plan_id(material_name, unit)")
      .eq("project_id", id)
      .is("deleted_at", null)
      .gte("spent_on", fromDate)
      .lte("spent_on", toDate)
      .order("spent_on", { ascending: false }),
    db
      .from("v_material_consumption_current")
      .select("id, material_plan_id, quantity_used, consumed_on, recorded_by, users:recorded_by(full_name), material_plan(material_name, unit, planned_quantity)")
      .eq("project_id", id)
      .gte("consumed_on", fromDate)
      .lte("consumed_on", toDate)
      .order("consumed_on", { ascending: false }),
  ]);

  type ExpenseRow = {
    id: string;
    amount: number | string;
    category: string;
    description: string | null;
    spent_on: string;
    approval_status: string;
    recorded_by: string | null;
    linked_material_plan_id: string | null;
    users: { full_name: string } | null;
    material_plan: { material_name: string; unit: string } | null;
  };
  const expenses = (expensesRes.data ?? []) as ExpenseRow[];

  type ConsumptionRow = {
    id: string;
    material_plan_id: string;
    quantity_used: number | string;
    consumed_on: string;
    recorded_by: string | null;
    users: { full_name: string } | null;
    material_plan: { material_name: string; unit: string; planned_quantity: number | string } | null;
  };
  const consumption = (consumptionRes.data ?? []) as ConsumptionRow[];

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const approvedTotal = expenses.filter(e => e.approval_status === "approved").reduce((s, e) => s + Number(e.amount), 0);
  const pendingTotal = expenses.filter(e => e.approval_status === "pending").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px 80px", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        title={`${project.name} — Expenses`}
        subtitle="Full expense + material consumption breakdown"
        actions={<Link href={`/projects/${id}`} style={{ fontSize: 12, color: "var(--color-tan)", textDecoration: "none" }}>← Back to project</Link>}
      />

      <ExpensesBreakdownClient initialFrom={fromDate} initialTo={toDate} projectId={id} />

      <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <SummaryTile label="Total" value={fmt(total)} tone="ink" />
        <SummaryTile label="Approved" value={fmt(approvedTotal)} tone="forest" />
        <SummaryTile label="Pending" value={fmt(pendingTotal)} tone="amber" />
      </div>

      <section style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 20 }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, marginBottom: 12 }}>Expenses ({expenses.length})</div>
        {expenses.length === 0 ? (
          <div style={{ color: "var(--color-tan)", fontSize: 13 }}>No expenses in this range.</div>
        ) : (
          <div className="scroll-x-mobile">
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--color-tan)", textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>
                <th style={th}>Date</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={th}>Material Plan</th>
                <th style={th}>Recorded by</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--color-line)" }}>
                  <td style={td}>{e.spent_on}</td>
                  <td style={td}>{e.category}</td>
                  <td style={td}>{e.description ?? "—"}</td>
                  <td style={td}>{e.material_plan ? `${e.material_plan.material_name} (${e.material_plan.unit})` : "—"}</td>
                  <td style={td}>{e.users?.full_name ?? "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmt(Number(e.amount))}</td>
                  <td style={td}><ExpenseApproval projectId={id} expenseId={e.id} status={e.approval_status} canApprove={!!canApprove} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 20 }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, marginBottom: 12 }}>Material Consumption ({consumption.length})</div>
        {consumption.length === 0 ? (
          <div style={{ color: "var(--color-tan)", fontSize: 13 }}>No material consumption logged in this range.</div>
        ) : (
          <div className="scroll-x-mobile">
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--color-tan)", textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>
                <th style={th}>Date</th>
                <th style={th}>Material</th>
                <th style={{ ...th, textAlign: "right" }}>Used</th>
                <th style={{ ...th, textAlign: "right" }}>Planned</th>
                <th style={th}>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {consumption.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--color-line)" }}>
                  <td style={td}>{c.consumed_on}</td>
                  <td style={td}>{c.material_plan?.material_name ?? "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{c.quantity_used} {c.material_plan?.unit ?? ""}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-tan)" }}>{c.material_plan?.planned_quantity ?? "—"}</td>
                  <td style={td}>{c.users?.full_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 10px", verticalAlign: "top" };

function fmt(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "ink" | "forest" | "amber" }) {
  const color = tone === "forest" ? "var(--color-forest)" : tone === "amber" ? "var(--color-amber)" : "var(--color-ink)";
  return (
    <div style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
