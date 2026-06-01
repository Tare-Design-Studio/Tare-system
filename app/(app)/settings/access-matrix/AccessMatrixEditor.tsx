"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Chip, Icon } from "@/components/atoms";
import { ConfirmPopover } from "@/components/atoms/ConfirmPopover";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import styles from "../../team/team-access.module.css";

const VALID_TAGS = ["accountant", "admin", "project_manager"] as const;
type Tag = (typeof VALID_TAGS)[number];

const TAG_LABELS: Record<Tag, string> = {
  accountant: "Accountant",
  admin: "Admin",
  project_manager: "Project Manager",
};

const CATEGORY_LABELS: Record<string, string> = {
  project: "Projects",
  enquiry: "Enquiries",
  customer: "Customers",
  customer_payments: "Customer Payments",
  team: "Team Management",
  materials: "Materials",
  progress: "Progress & Checklists",
  checklist: "Checklists",
  checkpoint: "Checkpoints",
  expenses: "Expenses",
  finance: "Finance",
  images: "Images & Media",
  bridge: "Bridge",
  calendar: "Calendar",
  daily_tasks: "Daily Tasks",
  broadcast: "Broadcasts",
  site_check_in: "Site Check-In",
  office_attendance: "Office Attendance",
  member_tasks: "Member Tasks",
  personal_reminders: "Personal Reminders",
  team_member_tags: "Tags",
  project_table: "Project Tables",
  table_preset: "Table Presets",
  intake_form: "Intake Form",
  audit_log: "Audit Log",
  access_control: "Access Control",
};

export interface Member {
  id: string;
  full_name: string;
  role: string;
}

interface CapRow {
  user_id: string;
  capability: string;
  granted: boolean;
  scope_project_id: string | null;
  source: string;
}

interface AccessMatrixEditorProps {
  members: Member[];
  /** user_id -> tag */
  tagByUser: Record<string, Tag | null>;
  /** user_id -> set of globally-granted capabilities */
  capsByUser: Record<string, string[]>;
}

interface PendingEdit {
  tag?: Tag | null;
  capabilities: Record<string, boolean>;
}

const ROLE_TONE: Record<string, "forest" | "indigo" | "amber"> = {
  owner: "forest",
  team_member: "indigo",
  site_engineer: "amber",
};

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function actionLabel(capability: string): string {
  return (capability.split(":")[1] ?? capability).replace(/_/g, " ");
}

const GROUPED = (() => {
  const groups: Record<string, string[]> = {};
  for (const cap of CAPABILITIES) {
    const prefix = cap.split(":")[0];
    (groups[prefix] ??= []).push(cap);
  }
  return Object.entries(groups);
})();

export function AccessMatrixEditor({ members, tagByUser, capsByUser }: AccessMatrixEditorProps) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, PendingEdit>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Holds the in-flight tag selection between onChange and ConfirmPopover.onConfirm.
  const pendingTagRef = useRef<Record<string, Tag | null>>({});

  const pendingCount = Object.keys(edits).length;

  // Effective value helpers (pending edit overrides server state).
  const effectiveTag = (m: Member): Tag | null => {
    const e = edits[m.id];
    if (e && "tag" in e) return e.tag ?? null;
    return tagByUser[m.id] ?? null;
  };
  const effectiveCap = (m: Member, cap: string): boolean => {
    const e = edits[m.id];
    if (e && cap in e.capabilities) return e.capabilities[cap];
    return (capsByUser[m.id] ?? []).includes(cap);
  };

  function stageTag(memberId: string, tag: Tag | null) {
    setEdits((prev) => {
      const next = { ...prev };
      const cur = next[memberId] ?? { capabilities: {} };
      next[memberId] = { ...cur, tag };
      return next;
    });
  }

  function stageCap(memberId: string, cap: string, granted: boolean) {
    setEdits((prev) => {
      const next = { ...prev };
      const cur = next[memberId] ?? { capabilities: {} };
      next[memberId] = { ...cur, capabilities: { ...cur.capabilities, [cap]: granted } };
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const [userId, edit] of Object.entries(edits)) {
        const capabilities = Object.entries(edit.capabilities).map(
          ([capability, granted]) => ({ capability, granted })
        );
        const res = await fetch("/api/access-matrix", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            ...("tag" in edit ? { tag: edit.tag } : {}),
            ...(capabilities.length ? { capabilities } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ? JSON.stringify(data.error) : `Save failed (${res.status})`);
        }
      }
      setEdits({});
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const rows = useMemo(
    () => [...members].sort((a, b) => {
      const rank: Record<string, number> = { owner: 0, team_member: 1, site_engineer: 2 };
      return (rank[a.role] ?? 9) - (rank[b.role] ?? 9);
    }),
    [members]
  );

  return (
    <>
      {error && (
        <div className={styles.notice} style={{ marginBottom: 14, background: "rgba(166,77,55,.08)", borderColor: "rgba(166,77,55,.2)" }}>
          <Icon name="x" size={14} /> {error}
        </div>
      )}

      <div className={styles.memberList}>
        {rows.map((m) => {
          const isOwner = m.role === "owner";
          const canTag = m.role === "team_member";
          const tag = effectiveTag(m);
          const dirty = !!edits[m.id];
          return (
            <div key={m.id} className={styles.accessRow}>
              <Avatar initials={initials(m.full_name)} tone={ROLE_TONE[m.role] ?? "indigo"} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={styles.memberName}>
                  {m.full_name}
                  {dirty && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-rust)" }}>
                      • unsaved
                    </span>
                  )}
                </div>
                <div className={styles.memberMeta} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Chip
                    label={m.role.replace(/_/g, " ")}
                    tone={ROLE_TONE[m.role] ?? "indigo"}
                    size="sm"
                    dot
                  />
                  {tag && <Chip label={TAG_LABELS[tag]} tone="indigo" size="sm" />}
                  {isOwner && <span style={{ fontSize: 11, color: "var(--color-tan)" }}>Full access</span>}
                </div>
              </div>

              {!isOwner && (
                <div className={styles.accessRowControls}>
                  {/* Tag select — confirmation popover opens before applying */}
                  <ConfirmPopover
                    title="Are you sure?"
                    message={`Change the access tag for ${m.full_name}? It will be applied when you save.`}
                    confirmLabel="Yes, change"
                    cancelLabel="Cancel"
                    onConfirm={() => {
                      const next = pendingTagRef.current[m.id];
                      if (next !== undefined) stageTag(m.id, next);
                    }}
                  >
                    {(open) => (
                      <select
                        value={tag ?? ""}
                        disabled={!canTag}
                        title={canTag ? "Assign access tag" : "Tags apply to team members only"}
                        onChange={(e) => {
                          const v = e.target.value;
                          pendingTagRef.current[m.id] = v === "" ? null : (v as Tag);
                          open();
                        }}
                        className={styles.accessRowSelect}
                        style={{ cursor: canTag ? "pointer" : "not-allowed" }}
                      >
                        <option value="">No tag</option>
                        {VALID_TAGS.map((t) => (
                          <option key={t} value={t}>{TAG_LABELS[t]}</option>
                        ))}
                      </select>
                    )}
                  </ConfirmPopover>

                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className={styles.button}
                    style={{ fontSize: 12 }}
                  >
                    <Icon name={expanded === m.id ? "x" : "shield"} size={13} />
                    {expanded === m.id ? "Close" : "Capabilities"}
                  </button>
                </div>
              )}

              {/* Per-capability override grid */}
              {!isOwner && expanded === m.id && (
                <div style={{ flexBasis: "100%", marginTop: 12 }} className={styles.accessGroups}>
                  {GROUPED.map(([prefix, caps]) => (
                    <div key={prefix} className={styles.accessGroup}>
                      <div className={styles.accessGroupHeader}>
                        <h3>{CATEGORY_LABELS[prefix] ?? prefix}</h3>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {caps.map((cap) => {
                          const locked = cap === "access_control:manage";
                          const on = effectiveCap(m, cap);
                          return (
                            <label
                              key={cap}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                fontSize: 12, fontFamily: "var(--font-mono)",
                                color: locked ? "var(--color-tan)" : "var(--color-ink)",
                                cursor: locked ? "not-allowed" : "pointer",
                              }}
                            >
                              <ConfirmPopover
                                title="Are you sure?"
                                message={`${on ? "Revoke" : "Grant"} "${actionLabel(cap)}" for ${m.full_name}? Applied on save.`}
                                confirmLabel="Yes, change"
                                cancelLabel="Cancel"
                                onConfirm={() => stageCap(m.id, cap, !on)}
                              >
                                {(open) => (
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={locked}
                                    onChange={() => open()}
                                  />
                                )}
                              </ConfirmPopover>
                              <span>{actionLabel(cap)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save bar — second confirmation before committing */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, gap: 10, alignItems: "center" }}>
        {pendingCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--color-tan)" }}>
            {pendingCount} member{pendingCount !== 1 ? "s" : ""} with unsaved changes
          </span>
        )}
        <ConfirmPopover
          title="Save access changes?"
          message={`Apply access changes for ${pendingCount} member${pendingCount !== 1 ? "s" : ""}? This takes effect immediately.`}
          confirmLabel={saving ? "Saving…" : "Save changes"}
          cancelLabel="Cancel"
          onConfirm={save}
        >
          {(open) => (
            <button
              type="button"
              onClick={open}
              disabled={pendingCount === 0 || saving}
              className={`${styles.button} ${styles.buttonPrimary}`}
              style={{ opacity: pendingCount === 0 || saving ? 0.5 : 1 }}
            >
              <Icon name="check" size={14} />
              Save Changes
            </button>
          )}
        </ConfirmPopover>
      </div>
    </>
  );
}
