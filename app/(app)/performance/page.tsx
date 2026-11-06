import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chip, Avatar } from "@/components/atoms";
import PerformanceClient, { type Remark } from "./PerformanceClient";

export default async function PerformancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Allow access if user has finance:view_dashboard OR team:edit_user (admin tag)
  const [{ data: capFinance }, { data: capTeam }] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" }),
    supabase.rpc("has_capability", { p_capability: "team:edit_user" }),
  ]);
  if (!capFinance && !capTeam) redirect("/");

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

  // Remarks (manual +/- points) for the current month — 129.
  const { data: remarks } = await supabase
    .from("kpi_remarks")
    .select("id, user_id, period_month, points, grade, note, created_at, author:users!kpi_remarks_created_by_fkey(full_name)")
    .eq("period_month", currentMonth)
    .order("created_at", { ascending: true });

  return (
    <PerformanceClient
      members={members ?? []}
      kpiRows={(kpiRows ?? []) as Parameters<typeof PerformanceClient>[0]["kpiRows"]}
      initialRemarks={(remarks ?? []) as Remark[]}
      currentMonth={currentMonth}
      canEdit={!!capTeam}
      currentUserId={user.id}
    />
  );
}
