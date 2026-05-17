import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chip, Avatar } from "@/components/atoms";
import PerformanceClient from "./PerformanceClient";

export default async function PerformancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" });
  if (!cap) redirect("/");

  // All team members for this tenant (for the month selector + member list)
  const { data: members } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .order("full_name");

  // Current month in YYYY-MM-01 format
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // KPI scores for current month
  const { data: kpiRows } = await supabase
    .from("v_kpi_scores")
    .select("*")
    .eq("period_month", currentMonth)
    .order("overall_kpi_score", { ascending: false });

  // Revenue contribution
  const { data: revenueRows } = await supabase
    .from("v_employee_revenue_contribution")
    .select("user_id, revenue_contribution, active_project_count");

  const revenueMap = Object.fromEntries(
    (revenueRows ?? []).map((r) => [r.user_id, r])
  );

  return (
    <PerformanceClient
      members={members ?? []}
      kpiRows={(kpiRows ?? []) as Parameters<typeof PerformanceClient>[0]["kpiRows"]}
      revenueMap={revenueMap}
      currentMonth={currentMonth}
    />
  );
}
