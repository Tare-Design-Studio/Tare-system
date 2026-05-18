// Server-side enrichment for audit_log rows: derives a human-readable entity
// label, a friendly resource noun, and the owning project name. The audit_log
// table itself is immutable and untouched — these fields are computed on read.

import type { SupabaseClient } from "@supabase/supabase-js";

type Json = Record<string, unknown> | null | undefined;

export type AuditRowInput = {
  id: string;
  resource_type: string;
  resource_id: string | null;
  before: unknown;
  after: unknown;
};

export type AuditEnrichment = {
  label: string;
  resource_label: string;
  project_name: string | null;
};

// Friendly singular noun per audited table.
const RESOURCE_LABELS: Record<string, string> = {
  projects: "project",
  project_tables: "table",
  project_table_rows: "table row",
  project_assignments: "project assignment",
  project_checkpoints: "checkpoint",
  checkpoint_items: "checklist item",
  updates: "update",
  owner_broadcasts: "broadcast",
  media_assets: "file",
  calendar_events: "calendar event",
  enquiries: "enquiry",
  customers: "customer",
  payment_schedule: "payment",
  payment_records: "payment record",
  material_plan: "material plan",
  material_consumption: "material consumption",
  expenses: "expense",
  site_check_ins: "site check-in",
  team_daily_tasks: "daily task",
  users: "user",
};

export function resourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? resourceType.replace(/_/g, " ");
}

function pick(obj: Json, key: string): string | null {
  if (obj && typeof obj === "object" && typeof obj[key] === "string") {
    return obj[key] as string;
  }
  return null;
}

// Best human name for the affected entity, from after (preferred) then before.
export function entityLabel(row: AuditRowInput): string {
  for (const src of [row.after as Json, row.before as Json]) {
    const name = pick(src, "name") ?? pick(src, "title") ?? pick(src, "full_name");
    if (name) return name;
    const body = pick(src, "body");
    if (body) return body.length > 40 ? `${body.slice(0, 40)}…` : body;
  }
  return resourceLabel(row.resource_type);
}

function projectIdOf(row: AuditRowInput): string | null {
  if (row.resource_type === "projects") return row.resource_id;
  return pick(row.after as Json, "project_id") ?? pick(row.before as Json, "project_id");
}

// Enrich a page of audit rows with label / resource_label / project_name.
// Project names are batch-fetched in a single query.
export async function enrichAuditRows<T extends AuditRowInput>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<(T & AuditEnrichment)[]> {
  const projectIds = Array.from(
    new Set(rows.map(projectIdOf).filter((v): v is string => !!v)),
  );

  const nameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    for (const p of data ?? []) nameById.set(p.id as string, p.name as string);
  }

  return rows.map((row) => ({
    ...row,
    label: entityLabel(row),
    resource_label: resourceLabel(row.resource_type),
    project_name: nameById.get(projectIdOf(row) ?? "") ?? null,
  }));
}
