"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Avatar } from "@/components/atoms";
import { useClientNow } from "@/lib/useClientNow";
import { formatTime, formatMinutes } from "../components/shared";
import { AssignTaskModal } from "../../team/AssignTaskModal";
import { MyProjectsCard } from "./MyProjectsCard";
import { AssignEngineerCard } from "./AssignEngineerCard";

export type TrackedTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectName: string | null;
};

export type TrackedCheckIn = {
  id: string;
  projectName: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number | null;
  withinGeofence: boolean;
};

export type TrackedEngineer = {
  id: string;
  name: string;
  roleLabel: string | null;
  isActive: boolean;
  phone: string | null;
  onSite: { projectName: string; since: string; withinGeofence: boolean } | null;
  officeCheckInAt: string | null;
  officeStillIn: boolean;
  officeMinutes: number;
  openTasks: TrackedTask[];
  completedCount: number;
  pendingReviewCount: number;
  recentCheckIns: TrackedCheckIn[];
  projects: { id: string; name: string; status: string }[];
};

export type TrackedUpdate = {
  id: string;
  authorId: string;
  authorName: string;
  body: string | null;
  updateType: string;
  createdAt: string;
  projectName: string | null;
};

type Props = {
  engineers: TrackedEngineer[];
  updates: TrackedUpdate[];
  projects: { id: string; name: string; current_stage?: string | null }[];
  nowMs: number;
  canAssignTask: boolean;
  canAssignToProject: boolean;
  /** The viewer — he can add himself to projects, so his own row is needed. */
  selfId: string;
  selfProjectIds: string[];
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function elapsed(fromIso: string, nowMs: number) {
  const mins = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 60000));
  return formatMinutes(mins);
}

function relativeDay(iso: string, nowMs: number) {
  const then = new Date(iso);
  const days = Math.floor((nowMs - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  accepted: "Accepted",
  in_progress: "In progress",
  pending_review: "In review",
  completed: "Done",
};

const CARD: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 18,
  border: "1px solid rgba(30,28,24,.05)",
  boxShadow: "var(--shadow-card)",
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--color-tan)",
};

export default function SiteTeamClient({
  engineers, updates, projects, nowMs, canAssignTask, canAssignToProject,
  selfId, selfProjectIds,
}: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [tab, setTab] = useState<"roster" | "updates" | "manage">("roster");

  // The server clock keeps the first paint deterministic; the client clock
  // takes over once mounted so "on site 2h 14m" keeps counting.
  const clientNow = useClientNow();
  const now = clientNow?.getTime() ?? nowMs;

  const onSiteNow = engineers.filter((e) => e.onSite);
  const inOffice = engineers.filter((e) => !e.onSite && e.officeStillIn);
  const idle = engineers.filter((e) => !e.onSite && !e.officeStillIn);
  const totalOpenTasks = engineers.reduce((n, e) => n + e.openTasks.length, 0);
  const totalPendingReview = engineers.reduce((n, e) => n + e.pendingReviewCount, 0);

  const assignableMembers = engineers.map((e) => ({
    id: e.id, name: e.name, initials: initials(e.name),
  }));

  // No peers to track, but he can still curate his own project list — so the
  // picker is shown rather than a bare empty state.
  if (engineers.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...CARD, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No other site engineers</div>
          <div style={{ fontSize: 13, color: "var(--color-tan)" }}>
            Nobody else is on the field roster yet. They will appear here once added.
          </div>
        </div>
        {canAssignToProject && (
          <MyProjectsCard projects={projects} alreadyIn={selfProjectIds} selfId={selfId} />
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Headline band — the three numbers that answer "what is happening right now" */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20,
      }}>
        <div style={{ ...CARD, padding: "16px 18px" }}>
          <div style={LABEL}>On site</div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
            {onSiteNow.length}
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-tan)" }}>
              /{engineers.length}
            </span>
          </div>
        </div>
        <div style={{ ...CARD, padding: "16px 18px" }}>
          <div style={LABEL}>Open tasks</div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
            {totalOpenTasks}
          </div>
        </div>
        <div style={{ ...CARD, padding: "16px 18px" }}>
          <div style={LABEL}>In review</div>
          <div style={{
            fontSize: 30, fontWeight: 700, lineHeight: 1.1, marginTop: 4,
            color: totalPendingReview > 0 ? "var(--color-amber)" : "var(--color-ink)",
          }}>
            {totalPendingReview}
          </div>
        </div>
      </div>

      {/* Section switch */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {([
          ["roster", `Roster (${engineers.length})`],
          ["updates", `Updates (${updates.length})`],
          ...(canAssignTask || canAssignToProject ? [["manage", "Manage"] as const] : []),
        ] as [typeof tab, string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{
            padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            border: "1px solid " + (tab === id ? "var(--color-forest)" : "var(--color-line)"),
            background: tab === id ? "var(--color-forest)" : "transparent",
            color: tab === id ? "#F3EFE7" : "var(--color-tan)",
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "roster" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {onSiteNow.length > 0 && (
            <Group title="On site now" engineers={onSiteNow} now={now}
              openId={openId} setOpenId={setOpenId} />
          )}
          {inOffice.length > 0 && (
            <Group title="In the office" engineers={inOffice} now={now}
              openId={openId} setOpenId={setOpenId} />
          )}
          {idle.length > 0 && (
            <Group title="Not checked in" engineers={idle} now={now}
              openId={openId} setOpenId={setOpenId} />
          )}
        </div>
      )}

      {tab === "updates" && (
        <div style={{ ...CARD, padding: 4 }}>
          {updates.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: "var(--color-tan)" }}>
              No site updates posted in the last 30 days.
            </div>
          ) : (
            updates.map((u, i) => (
              <div key={u.id} style={{
                padding: "14px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--color-line)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <Avatar initials={initials(u.authorName)} tone="amber" size={22} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{u.authorName}</span>
                  {u.projectName && (
                    <span style={{ fontSize: 12, color: "var(--color-tan)" }}>· {u.projectName}</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--color-tan)", marginLeft: "auto" }}>
                    {relativeDay(u.createdAt, now)} {formatTime(u.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {u.body || <span style={{ color: "var(--color-tan)" }}>({u.updateType.replace(/_/g, " ")})</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "manage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {canAssignToProject && (
            <MyProjectsCard
              projects={projects}
              alreadyIn={selfProjectIds}
              selfId={selfId}
            />
          )}
          {canAssignTask && (
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Assign a task</div>
              <div style={{ fontSize: 13, color: "var(--color-tan)", marginBottom: 14 }}>
                Hand work to any site engineer. Naming a project sends the finished
                task through review.
              </div>
              <button type="button" onClick={() => setAssignOpen(true)} style={{
                padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: "none", background: "var(--color-forest)", color: "#F3EFE7",
                cursor: "pointer", fontFamily: "inherit", minHeight: 44,
              }}>
                Assign task
              </button>
            </div>
          )}
          {canAssignToProject && engineers.length > 0 && (
            <AssignEngineerCard
              projects={projects}
              engineers={engineers.map((e) => ({
                id: e.id,
                name: e.name,
                projectIds: e.projects.map((p) => p.id),
              }))}
            />
          )}
        </div>
      )}

      {assignOpen && (
        <AssignTaskModal
          members={assignableMembers}
          projects={projects}
          onClose={() => {
            setAssignOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Group({ title, engineers, now, openId, setOpenId }: {
  title: string;
  engineers: TrackedEngineer[];
  now: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  return (
    <div>
      <div style={{ ...LABEL, marginBottom: 8 }}>{title} · {engineers.length}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {engineers.map((e) => (
          <EngineerCard key={e.id} engineer={e} now={now}
            expanded={openId === e.id}
            onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
        ))}
      </div>
    </div>
  );
}

function EngineerCard({ engineer: e, now, expanded, onToggle }: {
  engineer: TrackedEngineer;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const overdue = e.openTasks.filter(
    (t) => t.dueDate && new Date(`${t.dueDate}T23:59:59`).getTime() < now
  ).length;

  return (
    <div style={CARD}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
        fontFamily: "inherit", color: "inherit", minHeight: 44,
      }}>
        <Avatar initials={initials(e.name)} tone={e.onSite ? "teal" : "indigo"} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{e.name}</span>
            {!e.isActive && <Chip label="Inactive" tone="amber" />}
            {overdue > 0 && <Chip label={`${overdue} overdue`} tone="amber" dot />}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-tan)", marginTop: 3 }}>
            {e.onSite
              ? `On site · ${e.onSite.projectName} · ${elapsed(e.onSite.since, now)}`
              : e.officeStillIn
                ? `In office since ${e.officeCheckInAt ? formatTime(e.officeCheckInAt) : "—"}`
                : e.officeCheckInAt
                  ? `Office ${formatMinutes(e.officeMinutes)} today`
                  : "Not checked in today"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{e.openTasks.length}</div>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .5 }}>
            open
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-line)" }}>
          <Row label="Projects" value={e.projects.length > 0
            ? e.projects.map((p) => p.name).join(", ")
            : "None assigned"} />
          <Row label="Completed" value={`${e.completedCount}`} />
          {e.pendingReviewCount > 0 && <Row label="Awaiting review" value={`${e.pendingReviewCount}`} />}
          {e.phone && (
            <Row label="Phone" value={<a href={`tel:${e.phone}`} style={{ color: "var(--color-forest)" }}>{e.phone}</a>} />
          )}

          <SubHead>Open tasks</SubHead>
          {e.openTasks.length === 0 ? (
            <Empty>Nothing open.</Empty>
          ) : (
            e.openTasks.map((t) => {
              const late = t.dueDate && new Date(`${t.dueDate}T23:59:59`).getTime() < now;
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0",
                  borderBottom: "1px solid var(--color-line)",
                }}>
                  <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>
                    {t.title}
                    {t.projectName && (
                      <span style={{ color: "var(--color-tan)" }}> · {t.projectName}</span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 11, color: late ? "var(--color-amber)" : "var(--color-tan)",
                    whiteSpace: "nowrap",
                  }}>
                    {STATUS_LABELS[t.status] ?? t.status}
                    {t.dueDate ? ` · ${late ? "overdue" : new Date(t.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                  </span>
                </div>
              );
            })
          )}

          <SubHead>Recent site check-ins</SubHead>
          {e.recentCheckIns.length === 0 ? (
            <Empty>No site check-ins in the last 30 days.</Empty>
          ) : (
            e.recentCheckIns.map((c) => (
              <div key={c.id} style={{
                display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0",
                borderBottom: "1px solid var(--color-line)",
              }}>
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>
                  {c.projectName}
                  {!c.withinGeofence && (
                    <span style={{ color: "var(--color-amber)", fontSize: 11 }}> · off site</span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-tan)", whiteSpace: "nowrap" }}>
                  {relativeDay(c.checkedInAt, now)} {formatTime(c.checkedInAt)}
                  {c.checkedOutAt
                    ? ` → ${formatTime(c.checkedOutAt)} · ${formatMinutes(c.durationMinutes)}`
                    : " · still on site"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 16,
      padding: "8px 0", borderBottom: "1px solid var(--color-line)", fontSize: 13,
    }}>
      <span style={{ color: "var(--color-tan)", flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0 }}>{value}</span>
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <div style={{ ...LABEL, marginTop: 16, marginBottom: 4 }}>{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: "var(--color-tan)", padding: "8px 0" }}>{children}</div>
  );
}
