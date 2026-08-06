"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Chip, Icon } from "@/components/atoms";
import { TagsPanel } from "./TagsPanel";
import { MemberManageMenu } from "./MemberManageMenu";
import { MemberEditModeProvider } from "./MemberEditMode";
import { ReviewQueue } from "./ReviewQueue";
import { AssignTaskModal } from "./AssignTaskModal";
import { MemberDetailModal, type MemberDetail } from "./MemberDetailModal";
import { AssignToProjectPanel, type AssignableProject } from "./AssignToProjectPanel";
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
  /** Shows the "Add to a project" panel — gated on team:assign_to_project. */
  canAssignToProject: boolean;
  /** Active projects the caller may add people to. Empty unless canAssignToProject. */
  projects: AssignableProject[];
  currentUserId: string;
  /** Server-pinned clock, passed to the modal so elapsed labels don't drift. */
  nowMs: number;
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
  canAssignToProject, projects, currentUserId, nowMs, children,
}: TeamBoardProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<BoardMember | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Self is excluded: a task you assign to yourself is work nobody can review
  // (the API and migration 086 both block self-review).
  const assignableMembers = members
    .filter((m) => m.isActive && !m.isSelf)
    .map((m) => ({ id: m.id, name: m.name, initials: m.initials }));

  const memberLookup = Object.fromEntries(
    members.map((m) => [m.id, { name: m.name, initials: m.initials }])
  );

  // Roster filters. "Needs attention" is the reason this page gets opened, so it
  // is a first-class view rather than something to be spotted by scanning.
  const [rosterTab, setRosterTab] = useState<"all" | "attention" | "idle">("all");

  const busiest = useMemo(
    () => Math.max(1, ...members.map((m) => m.tasks.activeTasks.length)),
    [members]
  );

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

  // ── Headline figures ──────────────────────────────────────────────────────
  // What an owner opens this page to learn: who is here, how much work is in
  // flight, how much came back flagged.
  const activeMembers = members.filter((m) => m.isActive).length;
  const inFlight = members.reduce((s, m) => s + m.tasks.activeTasks.length, 0);
  const completedThisMonth = members.reduce((s, m) => s + m.tasks.completedCount, 0);
  const flagged = members.reduce(
    (s, m) => s + (m.tasks.errorCount ?? 0) + (m.tasks.revisionCount ?? 0),
    0
  );

  return (
    <>
      {canAssign && assignableMembers.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className={styles.button} type="button" onClick={() => setAssignOpen(true)}>
            <Icon name="clipboard" size={14} />
            Assign task
          </button>
        </div>
      )}

      <div className={styles.headline}>
        <div className={styles.headlineCell}>
          <div className={styles.headlineLabel}>On the team</div>
          <div className={styles.headlineValue}>{activeMembers}</div>
          <div className={styles.headlineFoot}>
            {members.length - activeMembers > 0
              ? `${members.length - activeMembers} yet to join`
              : "everyone has joined"}
          </div>
        </div>
        <div className={styles.headlineCell}>
          <div className={styles.headlineLabel}>Work in flight</div>
          <div className={styles.headlineValue}>{inFlight}</div>
          <div className={styles.headlineFoot}>
            {idleCount > 0 ? `${idleCount} with nothing on` : "spread across the team"}
          </div>
        </div>
        <div className={styles.headlineCell}>
          <div className={styles.headlineLabel}>Completed</div>
          <div className={styles.headlineValue}>{completedThisMonth}</div>
          <div className={styles.headlineFoot}>tasks closed this month</div>
        </div>
        <div className={styles.headlineCell}>
          <div className={styles.headlineLabel}>Needs attention</div>
          <div
            className={`${styles.headlineValue} ${
              attentionCount === 0 ? styles.headlineClear : styles.headlineRaised
            }`}
          >
            {attentionCount}
          </div>
          <div className={styles.headlineFoot}>
            {attentionCount === 0
              ? "nothing waiting on you"
              : flagged > 0
                ? `${flagged} flagged in review`
                : "awaiting your review"}
          </div>
        </div>
      </div>

      <div className={styles.teamGrid}>
        <div className={styles.card}>
          {/* The provider renders the card title and owns the edit-mode toggle
              that reveals each row's MemberManageMenu. */}
          <MemberEditModeProvider enabled={canManage}>
          <div className={styles.rosterFilters}>
            {([
              { key: "all" as const, label: "Everyone", count: members.length },
              { key: "attention" as const, label: "Needs attention", count: attentionCount },
              { key: "idle" as const, label: "Nothing on", count: idleCount },
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
                <Chip label="You" tone="forest" size="sm" />
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
                  <div className={styles.memberName}>{m.name}</div>
                  <div className={styles.memberMeta}>{m.roleLabel}</div>
                </div>

                {/* Workload as a length, so the busiest and the idle read down
                    the column without comparing numbers. */}
                <div className={styles.loadWrap}>
                  <span className={styles.loadBar}>
                    <span
                      className={`${styles.loadFill} ${
                        active === 0
                          ? styles.loadFillIdle
                          : active >= busiest && busiest > 1
                            ? styles.loadFillHeavy
                            : ""
                      }`}
                      style={{ width: active === 0 ? "100%" : `${(active / busiest) * 100}%` }}
                    />
                  </span>
                  <span className={styles.loadLabel}>
                    {active === 0 ? "nothing on" : `${active} active`}
                  </span>
                </div>

                {canSeePerformance ? (
                  <div className={styles.presence}>
                    <span className={styles.presenceStrong}>{m.hours}</span>
                    {" · "}
                    {m.presentDays}d
                  </div>
                ) : (
                  <div />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {reason && <span className={styles.flagDot}>{reason}</span>}
                  {canSeePerformance && <span className={styles.grade}>{m.grade}</span>}
                  <div
                    className={styles.inlineChips}
                    onClick={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    {canManageTags && (
                      <TagsPanel userId={m.id} userName={m.name} currentTags={m.tags} />
                    )}
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

        <div className={styles.sideStack}>
          {canSeePerformance && (
          <div className={styles.card}>
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
            <AssignToProjectPanel
              projects={projects}
              // Self is included here, unlike task assignment: putting yourself
              // on a project team is legitimate.
              members={members
                .filter((m) => m.isActive)
                .map((m) => ({ id: m.id, name: m.name, initials: m.initials }))}
            />
          )}

          {canAssign && <ReviewQueue members={memberLookup} currentUserId={currentUserId} />}

          {children}
        </div>
      </div>

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
