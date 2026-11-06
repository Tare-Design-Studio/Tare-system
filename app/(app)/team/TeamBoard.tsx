"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Avatar, Chip, Icon } from "@/components/atoms";
import { MemberManageMenu } from "./MemberManageMenu";
import { MemberEditModeProvider } from "./MemberEditMode";
import { ReviewQueue } from "./ReviewQueue";
import { MemberDetailModal, type MemberDetail } from "./MemberDetailModal";
import { SetProjectTeamsButton, type TeamProject, type ProjectAssignment } from "./ProjectTeamsModal";
import styles from "./team-access.module.css";

export interface BoardMember extends MemberDetail {
  role: string;
  role_label: string | null;
  phone: string | null;
  experience_years: number | null;
  salary_inr: number | null;
  tags: string[];
  isActive: boolean;
  isSelf: boolean;
  linkable: boolean;
}

export interface LeaderRow {
  id: string;
  name: string;
  initials: string;
  tone: "forest" | "amber" | "indigo";
  score: number;
  grade: string;
  pct: number;
}

interface TeamBoardProps {
  ownerName: string;
  ownerInitials: string;
  members: BoardMember[];
  leaders: LeaderRow[];
  canManage: boolean;
  canManageTags: boolean;
  canAssign: boolean;
  /**
   * Whether pay, attendance and KPI may be shown (096). False for a coordinator,
   * who reaches this page through `team:coordinate` and sees only who is on what.
   * The server does not query those figures for a coordinator, so the flag hides
   * the chrome around data that is already absent — it is not the access control.
   */
  canSeePerformance: boolean;
  /** Shows the "Set project teams" button — gated on team:assign_to_project. */
  canAssignToProject: boolean;
  /** Active projects the caller may add people to. Empty unless canAssignToProject. */
  projects: TeamProject[];
  /** Current project_assignments rows for those projects. */
  projectAssignments: ProjectAssignment[];
  currentUserId: string;
  /** Server-pinned clock, passed to the modal so elapsed labels don't drift. */
  nowMs: number;
  /** Broadcast card, rendered in the side column beneath the review queue. */
  broadcast: React.ReactNode;
  children: React.ReactNode;
}

const RANK_CLASS = [styles.rank1, styles.rank2, styles.rank3];

/** A member needs attention when work has stalled or come back flagged. */
function attentionReason(m: BoardMember): string | null {
  const awaiting = m.tasks.activeTasks.filter((t) => t.status === "pending_review").length;
  if (awaiting > 0) return `${awaiting} awaiting review`;
  const flagged = (m.tasks.errorCount ?? 0) + (m.tasks.revisionCount ?? 0);
  if (flagged > 0) return `${flagged} flagged`;
  if (!m.isActive) return "not yet joined";
  return null;
}

function activeLabel(n: number): string {
  if (n === 0) return "No active tasks";
  return `${n} active task${n === 1 ? "" : "s"}`;
}

/** Newest active task, else the most recently completed one. */
function latestTask(m: BoardMember): { label: string; title: string } | null {
  const active = m.tasks.activeTasks;
  if (active.length > 0) {
    const newest = active.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    return { label: "Now", title: newest.title };
  }
  const done = m.tasks.completedTasks[0];
  return done ? { label: "Last", title: done.title } : null;
}

/**
 * Team & Access board — members list plus a sidebar of performance, broadcasts,
 * review queue and daily tasks. Structure follows the sibling PlanWise repo;
 * the skin is this app's paper design system (no luma).
 *
 * `children` is the broadcast + daily-task server content, slotted into the
 * sidebar so those stay server-rendered.
 */
export function TeamBoard({
  ownerName, ownerInitials, members, leaders,
  canManage, canManageTags, canAssign, canSeePerformance,
  canAssignToProject, projects, projectAssignments, currentUserId, nowMs, broadcast, children,
}: TeamBoardProps) {
  const [detail, setDetail] = useState<BoardMember | null>(null);

  const memberLookup = Object.fromEntries(
    members.map((m) => [m.id, { name: m.name, initials: m.initials }])
  );

  // Roster filters. "Needs attention" is the reason this page gets opened, so it
  // is a first-class view rather than something to be spotted by scanning.
  const [rosterTab, setRosterTab] = useState<"all" | "attention" | "idle">("all");

  const attentionCount = useMemo(
    () => members.filter((m) => attentionReason(m) !== null).length,
    [members]
  );
  const idleCount = useMemo(
    () => members.filter((m) => m.tasks.activeTasks.length === 0 && m.isActive).length,
    [members]
  );

  const visibleMembers = useMemo(() => {
    if (rosterTab === "attention") return members.filter((m) => attentionReason(m) !== null);
    if (rosterTab === "idle") return members.filter((m) => m.tasks.activeTasks.length === 0 && m.isActive);
    return members;
  }, [members, rosterTab]);

  return (
    <>
      <div className={styles.teamGrid}>
        {/* Left column: members, then broadcasts directly beneath it at the same
            width. Broadcasts used to live in the right-hand sideStack; it reads
            as a team-wide surface, not a sidebar widget. */}
        <div className={styles.mainStack}>
        <div className={styles.card}>
          {/* The provider renders the card title and owns the edit-mode toggle
              that reveals each row's MemberManageMenu. */}
          <MemberEditModeProvider enabled={canManage}>
          <div className={styles.rosterFilters}>
            {([
              { key: "all" as const, label: "Everyone", count: members.length },
              { key: "attention" as const, label: "Review", count: attentionCount },
              { key: "idle" as const, label: "No active tasks", count: idleCount },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.rosterTab} ${rosterTab === t.key ? styles.rosterTabActive : ""}`}
                onClick={() => setRosterTab(t.key)}
                aria-pressed={rosterTab === t.key}
              >
                {t.label}
                {t.count > 0 && <span className={styles.rosterTabCount}>{t.count}</span>}
              </button>
            ))}
          </div>

          <div className={`${styles.roster} ${styles.memberScroll}`}>
            {/* Owner pinned first — not clickable, no metrics of their own. */}
            {rosterTab === "all" && (
              <div className={`${styles.rosterRow} ${styles.rosterOwnerRow}`}>
                <Avatar initials={ownerInitials} tone="forest" />
                <div style={{ minWidth: 0 }}>
                  <div className={styles.memberName}>{ownerName}</div>
                  <div className={styles.memberMeta}>Owner · Principal</div>
                </div>
                <div />
                <div />
                <div className={styles.rosterRowActions}>
                  <Chip label="You" tone="forest" size="sm" />
                </div>
              </div>
            )}

            {visibleMembers.length === 0 ? (
              <div className={styles.emptyNote} style={{ padding: "28px 0" }}>
                {rosterTab === "attention"
                  ? "Nothing needs your attention."
                  : "Everyone has work on."}
              </div>
            ) : visibleMembers.map((m) => {
              const active = m.tasks.activeTasks.length;
              const reason = attentionReason(m);
              const latest = latestTask(m);
              return (
              <div
                key={m.id}
                className={`${styles.rosterRow} ${m.linkable ? styles.rosterRowButton : ""}`}
                onClick={m.linkable ? () => setDetail(m) : undefined}
                role={m.linkable ? "button" : undefined}
                tabIndex={m.linkable ? 0 : undefined}
                onKeyDown={
                  m.linkable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetail(m);
                        }
                      }
                    : undefined
                }
              >
                <Avatar initials={m.initials} tone={m.tone} />
                <div style={{ minWidth: 0 }}>
                  <div className={styles.memberNameRow}>
                    <span className={styles.memberName}>{m.name}</span>
                    {reason && <span className={styles.flagDot}>{reason}</span>}
                  </div>
                  <div className={styles.memberMeta}>{m.roleLabel}</div>
                </div>

                {/* Current task by name — newest active one, else the most
                    recently completed, labelled so the two never read alike.
                    Hidden on phone in favour of rosterRowSummary below. */}
                <div className={styles.taskNow}>
                  <span className={styles.loadLabel}>{activeLabel(active)}</span>
                  {latest && (
                    <span className={styles.taskNowName} title={latest.title}>
                      <span className={styles.taskNowTag}>{latest.label}</span>
                      {latest.title}
                    </span>
                  )}
                </div>

                {canSeePerformance ? (
                  <div className={styles.presence}>
                    Worked{" "}
                    <span className={styles.presenceStrong}>
                      {m.presentDays} day{m.presentDays === 1 ? "" : "s"}
                    </span>
                    {" / "}
                    <span className={styles.presenceStrong}>{m.hours}</span>
                  </div>
                ) : (
                  <div />
                )}

                {/* Phone-only collapsed second line: present-today dot + check-in
                    time, active count as text, grade — replaces the task name and
                    the separate presence line above (hidden ≤820px). */}
                <div className={styles.rosterRowSummary}>
                  {m.todayCheckInAt && (
                    <span className={styles.presentDot}>
                      {new Date(m.todayCheckInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                  <span className={styles.loadLabel}>{activeLabel(active)}</span>
                  {canSeePerformance && <span className={styles.grade}>{m.grade}</span>}
                </div>

                <div className={styles.rosterRowActions}>
                  {canSeePerformance && <span className={styles.grade}>{m.grade}</span>}
                  <div
                    className={styles.inlineChips}
                    onClick={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    {canManage && !m.isSelf && (
                      <MemberManageMenu
                        member={{
                          id: m.id,
                          full_name: m.name,
                          role: m.role,
                          role_label: m.role_label,
                          phone: m.phone,
                          experience_years: m.experience_years,
                          salary_inr: m.salary_inr,
                          tags: canManageTags ? m.tags : undefined,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          </MemberEditModeProvider>

          <p className={styles.taskMeta} style={{ marginTop: 12 }}>
            {canSeePerformance
              ? "Grades reflect completed tasks, revisions, errors and on-time delivery."
              : "Open a member to see what they are working on."}
          </p>
        </div>

        {children}
        </div>

        <div className={styles.sideStack}>
          {canSeePerformance && (
          <div className={`${styles.card} ${styles.performanceCard}`}>
            <div className={styles.cardTitle}>
              <div className={styles.cardTitleText}>
                <h2 className="font-serif">Performance</h2>
                <p>This month</p>
              </div>
              <Link href="/performance" className={styles.cornerButton} aria-label="Open performance">
                <Icon name="arrowUR" size={15} />
              </Link>
            </div>
            {leaders.length === 0 ? (
              <div className={styles.emptyNote}>No performance data yet</div>
            ) : (
              leaders.map((l, i) => (
                <div key={l.id} className={styles.leaderRow}>
                  <span className={`${styles.rank} ${RANK_CLASS[i] ?? ""}`}>{i + 1}</span>
                  <Avatar initials={l.initials} tone={l.tone} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.name}
                      </span>
                      <span className={styles.taskMeta}>{l.score}</span>
                    </div>
                    <div className={styles.leaderBar}>
                      <div className={styles.leaderFill} style={{ width: `${l.pct}%` }} />
                    </div>
                  </div>
                  <span className={styles.grade}>{l.grade}</span>
                </div>
              ))
            )}
          </div>
          )}

          {canAssignToProject && (
            <SetProjectTeamsButton
              projects={projects}
              assignments={projectAssignments}
              // Self is included, unlike task assignment: putting yourself on a
              // project team is legitimate.
              people={members
                .filter((m) => m.isActive)
                .map((m) => ({ id: m.id, name: m.name, initials: m.initials, role: m.role }))}
            />
          )}

          {canAssign && <ReviewQueue members={memberLookup} currentUserId={currentUserId} />}

          {broadcast}
        </div>
      </div>

      {detail && (
        <MemberDetailModal
          member={detail}
          nowMs={nowMs}
          canSeePerformance={canSeePerformance}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
