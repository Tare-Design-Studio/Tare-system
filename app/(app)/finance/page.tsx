import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Chip } from "@/components/atoms";
import { PageHeader } from "../PageHeader";
import { DailyExpensesCard } from "./DailyExpensesCard";
import { ProjectExpensesPicker } from "./ProjectExpensesPicker";

function fmtAmount(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtShortAmount(n: number) {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return fmtAmount(n);
}

function formatPct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

type PaymentStatusRow = {
  schedule_id: string | null;
  project_id: string | null;
  milestone_name: string | null;
  amount_due: number | null;
  amount_received: number | null;
  variance: number | null;
  is_paid: boolean | null;
  due_date: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  status: string;
};

type ExpenseRow = {
  id: string;
  project_id: string | null;
  category: string | null;
  description: string | null;
  amount: number | null;
  approval_status: string | null;
  spent_on: string | null;
};

type PaymentRecordRow = {
  amount_paid: number;
  paid_on: string;
  project_id: string;
};

type ProjectSummary = {
  project_id: string;
  name: string;
  status: string;
  fee: number;
  billed: number;
  received: number;
  expenses: number;
  paid_milestones: number;
  total_milestones: number;
  overdue_count: number;
};

function Card({
  children,
  dark = false,
  style,
  pad = 24,
}: {
  children: React.ReactNode;
  dark?: boolean;
  style?: React.CSSProperties;
  pad?: number;
}) {
  return (
    <div
      style={{
        background: dark ? "var(--color-slate-deep)" : "var(--color-paper-light)",
        color: dark ? "#F3EFE7" : "var(--color-ink)",
        borderRadius: 22,
        padding: pad,
        boxShadow: dark
          ? "0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px -30px rgba(0,0,0,.4)"
          : "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
        border: dark ? "1px solid rgba(255,255,255,.06)" : "1px solid rgba(30,28,24,.04)",
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children, subtitle, dark = false }: { children: React.ReactNode; subtitle?: string; dark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3, color: dark ? "#F3EFE7" : "var(--color-ink)", lineHeight: 1.1 }}>
          {children}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: dark ? "rgba(243,239,231,.55)" : "var(--color-tan)", marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function SurfaceButton({ children, href, primary = false }: { children: React.ReactNode; href: string; primary?: boolean }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 38,
        padding: "9px 16px",
        borderRadius: 12,
        border: primary ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
        background: primary ? "var(--color-ink)" : "var(--color-paper-light)",
        color: primary ? "#F3EFE7" : "var(--color-ink)",
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}


export default async function FinancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cap } = await supabase.rpc("has_capability", {
    p_capability: "finance:view_dashboard",
  });
  if (!cap) redirect("/");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = `${fiscalYear}-04-01`;
  const fyLabel = `FY ${fiscalYear}-${String(fiscalYear + 1).slice(2)}`;

  const [scheduleRes, projectsRes, expensesRes, paymentsRes] = await Promise.all([
    supabase
      .from("v_payment_status")
      .select("schedule_id, project_id, milestone_name, amount_due, amount_received, variance, is_paid, due_date")
      .order("due_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, status")
      .is("deleted_at", null),
    supabase
      .from("v_expenses_current")
      .select("id, project_id, category, description, amount, approval_status, spent_on")
      .gte("spent_on", fyStart)
      .order("spent_on", { ascending: false }),
    supabase
      .from("payment_records")
      .select("project_id, amount_paid, paid_on")
      .gte("paid_on", fyStart),
  ]);

  const rows = (scheduleRes.data ?? []) as PaymentStatusRow[];
  const projectRows = (projectsRes.data ?? []) as ProjectRow[];
  const expenses = (expensesRes.data ?? []) as ExpenseRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRecordRow[];
  const projectMap = Object.fromEntries(projectRows.map((p) => [p.id, p]));

  const summaries: Record<string, ProjectSummary> = {};
  for (const row of rows) {
    if (!row.project_id) continue;
    const pid = row.project_id;
    if (!summaries[pid]) {
      summaries[pid] = {
        project_id: pid,
        name: projectMap[pid]?.name ?? "Unknown",
        status: projectMap[pid]?.status ?? "unknown",
        fee: 0,
        billed: 0,
        received: 0,
        expenses: 0,
        paid_milestones: 0,
        total_milestones: 0,
        overdue_count: 0,
      };
    }
    const s = summaries[pid];
    s.fee += Number(row.amount_due ?? 0);
    s.billed += Number(row.amount_due ?? 0);
    s.received += Number(row.amount_received ?? 0);
    s.total_milestones += 1;
    if (row.is_paid) s.paid_milestones += 1;
    if (!row.is_paid && row.due_date && row.due_date < today) s.overdue_count += 1;
  }

  for (const expense of expenses) {
    if (!expense.project_id) continue;
    const pid = expense.project_id;
    if (!summaries[pid]) {
      summaries[pid] = {
        project_id: pid,
        name: projectMap[pid]?.name ?? "Unknown",
        status: projectMap[pid]?.status ?? "unknown",
        fee: 0,
        billed: 0,
        received: 0,
        expenses: 0,
        paid_milestones: 0,
        total_milestones: 0,
        overdue_count: 0,
      };
    }
    summaries[pid].expenses += Number(expense.amount ?? 0);
  }

  const projects = Object.values(summaries)
    .sort((a, b) => b.billed - a.billed || a.name.localeCompare(b.name))
    .slice(0, 8);

  const totalBilled = Object.values(summaries).reduce((sum, p) => sum + p.billed, 0);
  const totalReceived = Object.values(summaries).reduce((sum, p) => sum + p.received, 0);
  const totalExpenses = Object.values(summaries).reduce((sum, p) => sum + p.expenses, 0);
  const outstanding = totalBilled - totalReceived;
  const mtdReceived = payments
    .filter((p) => p.paid_on >= monthStart)
    .reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);
  const ytdReceived = payments.reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);
  const overdueInvoices = Object.values(summaries).reduce((sum, p) => sum + p.overdue_count, 0);
  const expenseDelta = totalBilled > 0 ? ((totalExpenses / totalBilled) * 100) : 0;


  const dailyRows = expenses
    .filter((e) => e.spent_on)
    .map((e) => ({
      id: e.id,
      amount: Number(e.amount ?? 0),
      category: e.category,
      description: e.description,
      spent_on: e.spent_on as string,
      approval_status: e.approval_status ?? "pending",
      project_name: e.project_id ? (projectMap[e.project_id]?.name ?? null) : null,
    }));

  const kpis = [
    { label: "Revenue MTD", value: fmtShortAmount(mtdReceived), sub: `${payments.filter((p) => p.paid_on >= monthStart).length} payments recorded`, tone: "forest" },
    { label: "Revenue YTD", value: fmtShortAmount(ytdReceived), sub: `${formatPct(totalBilled ? (ytdReceived / totalBilled) * 100 : 0)} of billed value`, tone: "ink" },
    { label: "AR Outstanding", value: fmtShortAmount(outstanding), sub: `${overdueInvoices} invoices overdue`, tone: "amber" },
    { label: "Expenses vs Plan", value: `${formatPct(expenseDelta)}`, sub: `${fmtShortAmount(totalExpenses)} actual vs ${fmtShortAmount(totalBilled)} billed`, tone: "rust" },
  ];

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Finance"
        subtitle={`${fyLabel} · All Projects`}
        actions={
          <>
            <ProjectExpensesPicker
              projects={[...projectRows]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => ({ id: p.id, name: p.name }))}
            />
            <SurfaceButton href="/api/finance?format=csv">Export CSV</SurfaceButton>
            <SurfaceButton href="/api/finance?format=csv" primary>Generate Report</SurfaceButton>
          </>
        }
      />

      <div className="finance-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18, marginBottom: 32 }}>
        <style>{`@media (max-width: 767px) { .finance-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
        {kpis.map((k) => (
          <Card key={k.label} style={{ height: "100%", padding: "24px 28px" }}>
            <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{k.label}</div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 42, letterSpacing: -0.8, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: k.tone === "rust" || k.tone === "amber" ? "var(--color-amber)" : "var(--color-tan)", marginTop: 10 }}>{k.sub}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle subtitle={`Per project · ${fyLabel}`}>Project P&amp;L</CardTitle>
        {projects.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", textAlign: "center", padding: "32px 0" }}>
            No finance activity recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                  {["Project", "Fee", "Billed", "Received", "Expenses", "Margin"].map((h) => (
                    <th key={h} style={{ textAlign: h === "Project" ? "left" : "right", padding: "8px 10px 12px", fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p, index) => {
                  const margin = p.received > 0 ? ((p.received - p.expenses) / p.received) * 100 : 0;
                  const marginTone = margin > 70 ? "mint" : margin > 55 ? "sand" : "amber";
                  return (
                    <tr key={p.project_id} style={{ borderBottom: index < projects.length - 1 ? "1px solid var(--color-line)" : "none", transition: "background-color 0.2s" }}>
                      <td style={{ padding: "18px 10px", fontWeight: 500 }}>
                        <Link href={`/projects/${p.project_id}`} style={{ color: "inherit", textDecoration: "none" }}>{p.name}</Link>
                      </td>
                      <td style={{ textAlign: "right", padding: "18px 10px", fontFamily: "var(--font-mono)" }}>{fmtShortAmount(p.fee)}</td>
                      <td style={{ textAlign: "right", padding: "18px 10px", fontFamily: "var(--font-mono)" }}>{fmtShortAmount(p.billed)}</td>
                      <td style={{ textAlign: "right", padding: "18px 10px", fontFamily: "var(--font-mono)" }}>{fmtShortAmount(p.received)}</td>
                      <td style={{ textAlign: "right", padding: "18px 10px", fontFamily: "var(--font-mono)" }}>{fmtShortAmount(p.expenses)}</td>
                      <td style={{ textAlign: "right", padding: "18px 10px" }}>
                        <Chip size="sm" tone={marginTone} label={formatPct(margin)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DailyExpensesCard initial={dailyRows} nowMs={Date.now()} />
    </div>
  );
}
