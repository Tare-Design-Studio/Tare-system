"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/atoms";
import styles from "./team-access.module.css";

export type TeamProject = { id: string; name: string };
export type ProjectAssignment = { id: string; projectId: string; userId: string };
export type TeamPerson = { id: string; name: string; initials: string; role: string };

interface ProjectTeamsProps {
  projects: TeamProject[];
  assignments: ProjectAssignment[];
  people: TeamPerson[];
}

/**
 * "Set project teams" — drag a member or site engineer onto a project pill (or
 * the open project's team zone) to add them; remove with ✕. Tapping a person
 * adds them to the open project, so it works on touch screens where HTML5
 * drag-and-drop does not. Uses POST / DELETE /api/projects/[id]/assignments,
 * gated on team:assign_to_project.
 */
export function SetProjectTeamsButton(props: ProjectTeamsProps) {
  const [open, setOpen] = useState(false);
  if (props.projects.length === 0 || props.people.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${styles.setTeamsButton}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="users" size={14} />
        Set project teams
      </button>
      {open && <ProjectTeamsModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProjectTeamsModal({
  projects, assignments: initial, people, onClose,
}: ProjectTeamsProps & { onClose: () => void }) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initial);
  const [activeId, setActiveId] = useState(projects[0].id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  const countFor = (projectId: string) =>
    new Set(assignments.filter((a) => a.projectId === projectId).map((a) => a.userId)).size;

  const onActive = new Set(assignments.filter((a) => a.projectId === activeId).map((a) => a.userId));
  const team = people.filter((p) => onActive.has(p.id));
  const activeName = projects.find((p) => p.id === activeId)?.name ?? "";
  const teamMembers = people.filter((p) => p.role !== "site_engineer");
  const siteEngineers = people.filter((p) => p.role === "site_engineer");

  async function add(projectId: string, userId: string) {
    if (assignments.some((a) => a.projectId === projectId && a.userId === userId)) return;
    const person = people.find((p) => p.id === userId);
    if (!person) return;
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          role_on_project: person.role === "site_engineer" ? "site_engineer" : "team_member",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not add them to the project");
        return;
      }
      setChanged(true);
      setAssignments((prev) => [...prev, { id: body.assignment.id, projectId, userId }]);
    } catch {
      setError("Could not add them to the project");
    } finally {
      setBusy(null);
    }
  }

  async function remove(projectId: string, userId: string) {
    const rows = assignments.filter((a) => a.projectId === projectId && a.userId === userId);
    setBusy(userId);
    setError(null);
    try {
      for (const row of rows) {
        const res = await fetch(
          `/api/projects/${projectId}/assignments?assignment_id=${row.id}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Could not remove them from the project");
          return;
        }
        setChanged(true);
        setAssignments((prev) => prev.filter((a) => a.id !== row.id));
      }
    } catch {
      setError("Could not remove them from the project");
    } finally {
      setBusy(null);
    }
  }

  function close() {
    if (changed) router.refresh();
    onClose();
  }

  function dropProps(projectId: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropTarget(projectId);
      },
      onDragLeave: () => setDropTarget((t) => (t === projectId ? null : t)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropTarget(null);
        const userId = e.dataTransfer.getData("text/plain");
        if (userId) add(projectId, userId);
      },
    };
  }

  function personChip(p: TeamPerson) {
    const on = onActive.has(p.id);
    return (
      <button
        key={p.id}
        type="button"
        draggable={!on}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", p.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => add(activeId, p.id)}
        disabled={on || busy === p.id}
        className={`${styles.personChip} ${on ? styles.personChipOn : ""}`}
        title={on ? `Already on ${activeName}` : `Drag onto a project, or tap to add to ${activeName}`}
      >
        <Avatar initials={p.initials} tone={p.role === "site_engineer" ? "amber" : "indigo"} size={22} />
        <span className={styles.personChipName}>{p.name}</span>
        {on && <Icon name="check" size={12} />}
      </button>
    );
  }

  return (
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={`${styles.modal} ${styles.teamsModal}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Set project teams"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 className={styles.modalTitle}>Set project teams</h3>
            <div className={styles.fieldHint}>Drag people onto a project, or pick a project and tap to add.</div>
          </div>
          <button className={styles.cornerButton} onClick={close} type="button" aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className={styles.projectRow}>
          {searchOpen ? (
            <div className={styles.projectSearch}>
              <Icon name="search" size={14} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
              />
              <button
                type="button"
                className={styles.projectSearchClose}
                onClick={() => { setQuery(""); setSearchOpen(false); }}
                aria-label="Close search"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.projectSearchButton}
              onClick={() => setSearchOpen(true)}
              aria-label="Search projects"
            >
              <Icon name="search" size={15} />
            </button>
          )}
          <div className={styles.projectPills}>
            {visibleProjects.length === 0 && <span className={styles.fieldHint}>No matching projects</span>}
            {visibleProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveId(p.id)}
                aria-pressed={p.id === activeId}
                className={`${styles.projectPill} ${p.id === activeId ? styles.projectPillActive : ""} ${
                  dropTarget === p.id ? styles.projectPillDrop : ""
                }`}
                {...dropProps(p.id)}
              >
                {p.name}
                <span className={styles.projectPillCount}>{countFor(p.id)}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`${styles.teamZone} ${dropTarget === activeId ? styles.teamZoneDrop : ""}`}
          {...dropProps(activeId)}
        >
          <div className={styles.fieldLabel}>On {activeName}</div>
          {team.length === 0 ? (
            <div className={styles.fieldHint}>Nobody yet — drop someone here.</div>
          ) : (
            <div className={styles.chipWrap}>
              {team.map((p) => (
                <span key={p.id} className={`${styles.personChip} ${styles.personChipTeam}`}>
                  <Avatar initials={p.initials} tone={p.role === "site_engineer" ? "amber" : "indigo"} size={22} />
                  <span className={styles.personChipName}>{p.name}</span>
                  <button
                    type="button"
                    className={styles.personChipRemove}
                    onClick={() => remove(activeId, p.id)}
                    disabled={busy === p.id}
                    aria-label={`Remove ${p.name} from ${activeName}`}
                  >
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <div className={styles.errorNote}>{error}</div>}

        {teamMembers.length > 0 && (
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Team members</div>
            <div className={styles.chipWrap}>{teamMembers.map(personChip)}</div>
          </div>
        )}
        {siteEngineers.length > 0 && (
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Site engineers</div>
            <div className={styles.chipWrap}>{siteEngineers.map(personChip)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
