"use client";

import { Fragment, useState } from "react";
import { Chip } from "@/components/atoms";
import { PageHeader } from "../PageHeader";

type AuditActor = { id?: string; full_name?: string } | null;

type AuditRow = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before: unknown;
  after: unknown;
  ip_address: unknown;
  user_agent: string | null;
  request_id: string | null;
  prev_hash: string | null;
  row_hash: string | null;
  occurred_at: string;
  actor: unknown;
};

type User = { id: string; full_name: string };

type Props = {
  initialRows: AuditRow[];
  totalCount: number;
  users: User[];
  canExport: boolean;
};

const ACTIONS = ["insert", "update", "soft_delete", "delete", "hard_purge", "session_revoke"] as const;

const ACTION_TONES: Record<string, "forest" | "amber" | "rust" | "sand" | "teal"> = {
  insert: "forest",
  update: "amber",
  soft_delete: "rust",
  delete: "rust",
  hard_purge: "rust",
  session_revoke: "amber",
  view: "teal",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hashShort(h: unknown) {
  if (!h || typeof h !== "string") return "-";
  return `${h.slice(0, 8)}...`;
}

function actorName(actor: unknown): string | null {
  if (actor && typeof actor === "object" && "full_name" in actor) {
    return (actor as AuditActor)?.full_name ?? null;
  }
  return null;
}

function jsonStr(val: unknown): string {
  return JSON.stringify(val, null, 2);
}

function SurfaceButton({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 38,
        padding: "9px 16px",
        borderRadius: 12,
        border: primary ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
        background: primary ? "var(--color-ink)" : "var(--color-paper-light)",
        color: primary ? "#F3EFE7" : "var(--color-ink)",
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 28,
        padding: "5px 11px",
        borderRadius: 999,
        border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
        background: active ? "var(--color-ink)" : "var(--color-paper-light)",
        color: active ? "#F3EFE7" : "var(--color-ink)",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--color-paper-light)",
        color: "var(--color-ink)",
        borderRadius: 22,
        boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
        border: "1px solid rgba(30,28,24,.04)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function AuditClient({ initialRows, totalCount, users, canExport }: Props) {
  const [rows, setRows] = useState<AuditRow[]>(initialRows);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [actorId, setActorId] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const LIMIT = 50;
  const totalPages = Math.ceil(total / LIMIT);

  function buildUrl(p: number, overrides?: { actorId?: string; resourceType?: string; action?: string; from?: string; to?: string }) {
    const params = new URLSearchParams();
    const nextActorId = overrides?.actorId ?? actorId;
    const nextResourceType = overrides?.resourceType ?? resourceType;
    const nextAction = overrides?.action ?? action;
    const nextFrom = overrides?.from ?? from;
    const nextTo = overrides?.to ?? to;

    params.set("page", String(p));
    params.set("limit", String(LIMIT));
    if (nextActorId) params.set("actor_id", nextActorId);
    if (nextResourceType) params.set("resource_type", nextResourceType);
    if (nextAction) params.set("action", nextAction);
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    return `/api/audit?${params.toString()}`;
  }

  async function load(p: number, overrides?: { actorId?: string; resourceType?: string; action?: string; from?: string; to?: string }) {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(p, overrides));
      if (res.ok) {
        const json = await res.json();
        setRows(json.data ?? []);
        setTotal(json.meta?.total ?? 0);
        setPage(p);
        setExpanded(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function setActorFilter(nextActorId: string) {
    setActorId(nextActorId);
    load(1, { actorId: nextActorId });
  }

  function setActionFilter(nextAction: string) {
    setAction(nextAction);
    load(1, { action: nextAction });
  }

  function applyFilters() {
    load(1);
  }

  function clearFilters() {
    setActorId("");
    setResourceType("");
    setAction("");
    setFrom("");
    setTo("");
    load(1, { actorId: "", resourceType: "", action: "", from: "", to: "" });
  }

  async function doExport() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch("/api/audit/export", { method: "POST" });
      if (res.ok) {
        const blob = await res.blob();
        const sha = res.headers.get("X-Export-SHA256") ?? "";
        const count = res.headers.get("X-Row-Count") ?? "0";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "audit-export.ndjson";
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg(`Exported ${count} rows · SHA-256: ${sha.slice(0, 16)}...`);
      } else {
        const json = await res.json().catch(() => ({}));
        setExportMsg(`Export failed: ${json.error ?? "unknown error"}`);
      }
    } finally {
      setExporting(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid var(--color-line)",
    background: "var(--color-paper-light)",
    fontSize: 12,
    color: "var(--color-ink)",
    minWidth: 130,
    outline: "none",
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only · every mutation recorded"
        actions={canExport && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <SurfaceButton onClick={doExport} disabled={exporting} primary>
              {exporting ? "Exporting..." : "Export CSV"}
            </SurfaceButton>
            {exportMsg && <span style={{ fontSize: 11, color: "var(--color-tan)", maxWidth: 340, textAlign: "right" }}>{exportMsg}</span>}
          </div>
        )}
      />

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 28, background: "rgba(30,28,24,.02)", padding: "20px 24px", borderRadius: 18, border: "1px solid var(--color-line)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Actor</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip label="All" active={!actorId} onClick={() => setActorFilter("")} />
            {users.slice(0, 8).map((u) => (
              <FilterChip key={u.id} label={u.full_name} active={actorId === u.id} onClick={() => setActorFilter(u.id)} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Action</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip label="All" active={!action} onClick={() => setActionFilter("")} />
            {ACTIONS.map((a) => (
              <FilterChip key={a} label={a.replace(/_/g, " ").toUpperCase()} active={action === a} onClick={() => setActionFilter(a)} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            placeholder="Filter Resource..."
            style={fieldStyle}
          />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={fieldStyle} />
          <span style={{ fontSize: 12, color: "var(--color-tan)" }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={fieldStyle} />
        </div>
        
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <SurfaceButton onClick={applyFilters} disabled={loading} primary>Apply Filters</SurfaceButton>
          <SurfaceButton onClick={clearFilters} disabled={loading}>Clear</SurfaceButton>
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: "var(--color-tan)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Showing {rows.length} of {total.toLocaleString()} entries</span>
      </div>

      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                {["Timestamp", "Actor", "Action", "Resource", "Detail", "IP"].map((h, index, arr) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: 11,
                      color: "var(--color-tan)",
                      textTransform: "uppercase",
                      letterSpacing: 0.7,
                      fontWeight: 500,
                      background: "var(--bg-2)",
                      borderRadius: index === 0 ? "22px 0 0 0" : index === arr.length - 1 ? "0 22px 0 0" : 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isExpanded = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      style={{ borderBottom: index < rows.length - 1 || isExpanded ? "1px solid var(--color-line)" : "none", cursor: "pointer", transition: "background-color 0.1s" }}
                      onClick={() => setExpanded(isExpanded ? null : row.id)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(30,28,24,.02)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <td style={{ padding: "16px", fontSize: 11, color: "var(--color-tan)", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
                        {fmtDate(row.occurred_at)}
                      </td>
                      <td style={{ padding: "16px", fontWeight: 500, whiteSpace: "nowrap" }}>
                        {actorName(row.actor) ?? <span style={{ color: "var(--color-tan)" }}>system</span>}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <Chip size="sm" tone={ACTION_TONES[row.action] ?? "sand"} label={row.action.replace(/_/g, " ").toUpperCase()} />
                      </td>
                      <td style={{ padding: "16px" }}>
                        <Chip size="sm" tone="sand" label={row.resource_type} />
                      </td>
                      <td style={{ padding: "16px", fontSize: 12, color: "var(--ink-2)" }}>
                        <span style={{ display: "block", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.resource_id ? `${row.resource_id.slice(0, 8)}...` : "No resource id"} · hash {hashShort(row.row_hash)}
                        </span>
                      </td>
                      <td style={{ padding: "16px", fontSize: 11, color: "var(--color-tan)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                        {row.ip_address != null ? String(row.ip_address) : "-"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: "var(--bg-2)", borderBottom: index < rows.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <td colSpan={6} style={{ padding: "16px 18px 18px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                            {row.before != null && (
                              <div>
                                <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 6 }}>Before</div>
                                <pre style={{ fontSize: 10, color: "var(--color-ink)", background: "var(--color-paper-light)", borderRadius: 8, padding: 10, overflowX: "auto", margin: 0, lineHeight: 1.5, border: "1px solid var(--color-line)" }}>
                                  {jsonStr(row.before)}
                                </pre>
                              </div>
                            )}
                            {row.after != null && (
                              <div>
                                <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 6 }}>After</div>
                                <pre style={{ fontSize: 10, color: "var(--color-ink)", background: "var(--color-paper-light)", borderRadius: 8, padding: 10, overflowX: "auto", margin: 0, lineHeight: 1.5, border: "1px solid var(--color-line)" }}>
                                  {jsonStr(row.after)}
                                </pre>
                              </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
                              <div><span style={{ color: "var(--color-tan)", marginRight: 6 }}>Request ID:</span><span style={{ fontFamily: "var(--font-mono)" }}>{row.request_id ?? "-"}</span></div>
                              <div><span style={{ color: "var(--color-tan)", marginRight: 6 }}>prev_hash:</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{row.prev_hash ?? "-"}</span></div>
                              <div><span style={{ color: "var(--color-tan)", marginRight: 6 }}>row_hash:</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{row.row_hash ?? "-"}</span></div>
                              {row.user_agent && <div style={{ color: "var(--color-tan)", fontSize: 10, wordBreak: "break-all" }}>{row.user_agent}</div>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "var(--color-tan)", fontSize: 13 }}>
                    No audit entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--color-line)", background: "var(--bg-2)" }}>
            <span style={{ fontSize: 12, color: "var(--color-tan)" }}>
              Page {page} of {totalPages} · {total.toLocaleString()} entries
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", fontSize: 12, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.4 : 1 }}
              >
                ←
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => load(page + 1)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", fontSize: 12, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.4 : 1 }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
