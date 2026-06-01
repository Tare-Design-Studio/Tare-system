import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../PageHeader";
import UpdatesClient, { type UpdateRow } from "./UpdatesClient";

export const metadata = { title: "Updates — ArchitectOS" };

type SearchParams = Promise<{ month?: string; from?: string; to?: string }>;

function startOfMonthIso(year: number, monthIdx: number): string {
  return new Date(Date.UTC(year, monthIdx, 1)).toISOString();
}

function endOfMonthIso(year: number, monthIdx: number): string {
  return new Date(Date.UTC(year, monthIdx + 1, 1) - 1).toISOString();
}

function parseDateInput(s: string | undefined, fallbackIso: string, endOfDay: boolean): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallbackIso;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return `${s}${suffix}`;
}

export default async function UpdatesPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const todayYear = now.getUTCFullYear();
  const todayMonth = now.getUTCMonth();

  // Resolve range:
  // - explicit from/to wins
  // - otherwise month=YYYY-MM
  // - default: current month
  const hasCustomRange = Boolean(params.from || params.to);
  const selectedMonth = !hasCustomRange
    ? (params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}`)
    : null;

  let fromIso: string;
  let toIso: string;
  if (hasCustomRange) {
    const defaultFrom = startOfMonthIso(todayYear, todayMonth);
    const defaultTo = endOfMonthIso(todayYear, todayMonth);
    fromIso = parseDateInput(params.from, defaultFrom, false);
    toIso = parseDateInput(params.to, defaultTo, true);
  } else {
    const [y, m] = (selectedMonth as string).split("-").map(Number);
    fromIso = startOfMonthIso(y, m - 1);
    toIso = endOfMonthIso(y, m - 1);
  }

  const { data } = await supabase
    .from("updates")
    .select(`id, update_type, body, created_at, project_id,
      users:author_id (full_name),
      projects:project_id (name)`)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(500);

  const updates = (data ?? []) as UpdateRow[];

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="All Updates"
        subtitle={`${updates.length} update${updates.length === 1 ? "" : "s"}`}
      />
      <UpdatesClient
        updates={updates}
        nowMs={now.getTime()}
        selectedMonth={selectedMonth}
        fromDate={params.from ?? ""}
        toDate={params.to ?? ""}
        todayYear={todayYear}
        todayMonth={todayMonth}
      />
    </div>
  );
}
