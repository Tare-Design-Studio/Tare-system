import { redirect } from "next/navigation";
import { type ComponentProps } from "react";
import { createClient } from "@/lib/supabase/server";
import { enrichAuditRows } from "@/lib/audit/summarize";
import AuditClient from "./AuditClient";

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "audit_log:view" });
  if (!cap) redirect("/");

  const canExport = await supabase.rpc("has_capability", { p_capability: "audit_log:export" });

  // Fetch first page server-side
  const { data: rows, count } = await supabase
    .from("audit_log")
    .select(`
      id, action, resource_type, resource_id,
      before, after, ip_address, user_agent, request_id,
      prev_hash, row_hash, occurred_at,
      actor:actor_id(id, full_name)
    `, { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(0, 49);

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedRows = await enrichAuditRows(supabase, (rows ?? []) as any[]);

  return (
    <AuditClient
      initialRows={enrichedRows as unknown as ComponentProps<typeof AuditClient>["initialRows"]}
      totalCount={count ?? 0}
      users={users ?? []}
      canExport={!!canExport.data}
    />
  );
}
