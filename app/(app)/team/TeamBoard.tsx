"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Chip, Icon } from "@/components/atoms";
import { TagsPanel } from "./TagsPanel";
import { MemberManageMenu } from "./MemberManageMenu";
import { MemberEditModeProvider } from "./MemberEditMode";
import { ReviewQueue } from "./ReviewQueue";
import { AssignTaskModal } from "./AssignTaskModal";
import { MemberDetailModal, type MemberDetail } from "./MemberDetailModal";
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
  currentUserId: string;
  /** Server-pinned clock, passed to the modal so elapsed labels don't drift. */
  nowMs: number;
  children: React.ReactNode;
}

const RANK_CLASS = [styles.rank1, styles.rank2, styles.rank3];

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
  canManage, canManageTags, canAssign, currentUserId, nowMs, children,
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

      <div className={styles.teamGrid}>
        <div className={styles.card}>
          {/* The provider renders the card title and owns the edit-mode toggle
              that reveals each row's MemberManageMenu. */}
          <MemberEditModeProvider enabled={canManage}>
          <div className={`${styles.memberList} ${styles.memberScroll}`}>
            {/* Owner pinned first — not clickable, no metrics of their own. */}
            <div className={`${styles.memberRow} ${styles.ownerRow}`}>
              <Avatar initials={ownerInitials} tone="forest" />
              <div style={{ minWidth: 0 }}>
                <div className={styles.memberName}>{ownerName}</div>
                <div className={styles.memberMeta}>Owner · Principal</div>
              </div>
              <div />
              <Chip label="You" tone="forest" size="sm" />
            </div>

            {members.map((m) => (
              <div
                key={m.id}
                className={`${styles.memberRow} ${m.linkable ? styles.memberRowButton : ""}`}
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

                <div className={styles.metricChips}>
                  <span className={styles.metricChip}>{m.presentDays}d present</span>
                  <span className={styles.metricChip}>{m.hours}</span>
                  <span className={styles.metricChip}>{m.checkIns} check-ins</span>
                  {m.tasks.activeTasks.length > 0 && (
                    <span className={styles.metricChip}>{m.tasks.activeTasks.length} active</span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {!m.isActive && <Chip label="Pending" tone="sand" size="sm" />}
                  <span className={styles.grade}>{m.grade}</span>
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
            ))}
          </div>
          </MemberEditModeProvider>

          <p className={styles.taskMeta} style={{ marginTop: 12 }}>
            Grades reflect completed tasks, revisions, errors and on-time delivery.
          </p>
        </div>

        <div className={styles.sideStack}>
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

          {canAssign && <ReviewQueue members={memberLookup} currentUserId={currentUserId} />}

          {children}
        </div>
      </div>

      {assignOpen && (
        <AssignTaskModal
          members={assignableMembers}
          onClose={() => {
            setAssignOpen(false);
            router.refresh();
          }}
        />
      )}

      {detail && (
        <MemberDetailModal member={detail} nowMs={nowMs} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
