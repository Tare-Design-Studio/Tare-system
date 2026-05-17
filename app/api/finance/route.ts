import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Capability check — finance:view_dashboard
  const { data: cap } = await supabase.rpc("has_capability", {
    p_capability: "finance:view_dashboard",
  });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Aggregate payment status across all projects for this tenant
  const { data: rows, error } = await supabase
    .from("v_payment_status")
    .select("project_id, amount_due, amount_received, variance, is_paid, due_date, milestone_name, triggered_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch project names
  const projectIds = [...new Set((rows ?? []).map((r) => r.project_id).filter(Boolean))] as string[];
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status")
    .in("id", projectIds);

  const projectMap = Object.fromEntries((projects ?? []).map((p) => [p.id, p]));

  // Aggregate per project
  type ProjectSummary = {
    project_id: string;
    name: string;
    status: string;
    total_due: number;
    total_received: number;
    total_variance: number;
    paid_milestones: number;
    total_milestones: number;
    next_due_date: string | null;
    overdue_count: number;
  };

  const projectSummaries: Record<string, ProjectSummary> = {};
  const today = new Date().toISOString().split("T")[0];

  for (const row of rows ?? []) {
    const pid = row.project_id as string;
    if (!projectSummaries[pid]) {
      projectSummaries[pid] = {
        project_id: pid,
        name: projectMap[pid]?.name ?? "Unknown",
        status: projectMap[pid]?.status ?? "unknown",
        total_due: 0,
        total_received: 0,
        total_variance: 0,
        paid_milestones: 0,
        total_milestones: 0,
        next_due_date: null,
        overdue_count: 0,
      };
    }

    const ps = projectSummaries[pid];
    ps.total_due += Number(row.amount_due ?? 0);
    ps.total_received += Number(row.amount_received ?? 0);
    ps.total_variance += Number(row.variance ?? 0);
    ps.total_milestones += 1;
    if (row.is_paid) ps.paid_milestones += 1;

    // Track next upcoming unpaid due date
    if (!row.is_paid && row.due_date) {
      if (!ps.next_due_date || row.due_date < ps.next_due_date) {
        ps.next_due_date = row.due_date;
      }
      if (row.due_date < today) ps.overdue_count += 1;
    }
  }

  const summaryList = Object.values(projectSummaries).sort((a, b) => {
    if (!a.next_due_date && !b.next_due_date) return 0;
    if (!a.next_due_date) return 1;
    if (!b.next_due_date) return -1;
    return a.next_due_date.localeCompare(b.next_due_date);
  });

  const grandTotal = summaryList.reduce(
    (acc, p) => ({
      total_due: acc.total_due + p.total_due,
      total_received: acc.total_received + p.total_received,
      total_variance: acc.total_variance + p.total_variance,
    }),
    { total_due: 0, total_received: 0, total_variance: 0 }
  );

  const format = new URL(req.url).searchParams.get("format");

  if (format === "csv") {
    // Capability check for export
    const { data: exportCap } = await supabase.rpc("has_capability", {
      p_capability: "finance:export",
    });
    if (!exportCap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const headers = [
      "Project",
      "Status",
      "Total Due (₹)",
      "Total Received (₹)",
      "Variance (₹)",
      "Paid Milestones",
      "Total Milestones",
      "Next Due Date",
      "Overdue Count",
    ];

    const csvEscape = (v: string | number | null) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const csvRows = summaryList.map((p) =>
      [
        p.name,
        p.status,
        p.total_due.toFixed(2),
        p.total_received.toFixed(2),
        p.total_variance.toFixed(2),
        p.paid_milestones,
        p.total_milestones,
        p.next_due_date ?? "",
        p.overdue_count,
      ]
        .map(csvEscape)
        .join(",")
    );

    const csv = [headers.join(","), ...csvRows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="finance-${today}.csv"`,
      },
    });
  }

  return NextResponse.json({ ...grandTotal, projects: summaryList });
}
