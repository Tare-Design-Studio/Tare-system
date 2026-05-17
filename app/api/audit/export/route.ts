import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "audit_log:export" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Export the prior week's audit_log rows as NDJSON.
  // range_end = start of current day UTC; range_start = 7 days prior.
  const now = new Date();
  const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeStart = new Date(rangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: rows, error } = await supabase
    .from("audit_log")
    .select("*")
    .gte("occurred_at", rangeStart.toISOString())
    .lt("occurred_at", rangeEnd.toISOString())
    .order("occurred_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No audit rows in the requested range" }, { status: 404 });
  }

  // Build NDJSON payload
  const ndjson = rows.map((r) => JSON.stringify(r)).join("\n");
  const exportSha256 = createHash("sha256").update(ndjson, "utf8").digest("hex");

  const { data: me } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Record the export in audit_export_log (inline — no R2/S3 in v1; URI is local sentinel)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await (supabase as any).from("audit_export_log").insert({
    tenant_id: me.tenant_id,
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    row_count: rows.length,
    first_row_hash: rows[0].row_hash,
    last_row_hash: rows[rows.length - 1].row_hash,
    export_sha256: exportSha256,
    export_uri: `local://audit-export-${rangeStart.toISOString().slice(0, 10)}_${rangeEnd.toISOString().slice(0, 10)}.ndjson`,
    exported_by: user.id,
    notes: "Manual export via Audit Log UI",
  });

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

  // Stream NDJSON file to browser
  return new NextResponse(ndjson, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="audit-export-${rangeStart.toISOString().slice(0, 10)}.ndjson"`,
      "X-Export-SHA256": exportSha256,
      "X-Row-Count": String(rows.length),
    },
  });
}
