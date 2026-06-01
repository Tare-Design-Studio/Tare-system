"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, Icon } from "@/components/atoms";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  project_type: string | null;
  current_stage: string;
  scope: string;
  status: string;
  start_date: string | null;
  expected_end_date: string | null;
  estimated_work_hours: number | null;
  project_checkpoints: { completed_at: string | null }[];
  project_assignments: { users: { full_name: string } | null }[];
};

function capitalise(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeProgress(checkpoints: { completed_at: string | null }[]): number {
  if (!checkpoints.length) return 0;
  const done = checkpoints.filter((c) => c.completed_at !== null).length;
  return Math.round((done / checkpoints.length) * 100);
}

// `nowMs` is passed in (server-computed epoch ms). Calling `new Date()` here
// would diverge between server and client render and break hydration.
function computeElapsed(startDate: string | null, nowMs: number): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  return Math.floor((nowMs - start.getTime()) / (1000 * 60 * 60 * 24));
}

function computeRemaining(endDate: string | null, nowMs: number): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  return Math.floor((end.getTime() - nowMs) / (1000 * 60 * 60 * 24));
}

const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      padding: "7px 14px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 500,
      background: active ? "var(--color-ink)" : "var(--color-paper-light)",
      color: active ? "var(--color-paper)" : "var(--ink-2)",
      border: active ? "none" : "1px solid var(--line-2)",
      boxShadow: active ? "none" : "0 1px 0 #FFF inset",
      flexShrink: 0,
      cursor: "pointer",
      transition: "all 0.1s",
    }}
  >
    {label}
  </button>
);

function ProjectCard({ p, nowMs }: { p: ProjectRow; nowMs: number }) {
  const progress = computeProgress(p.project_checkpoints);
  const elapsed = computeElapsed(p.start_date, nowMs);
  const remaining = computeRemaining(p.expected_end_date, nowMs);

  const statusLabel = capitalise(p.status);
  const stageLabel = p.current_stage === "execution" ? "Execution" : "Design";

  const getStatusTone = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "forest";
      case "completed": return "mint";
      case "on_hold": return "amber";
      default: return "ink";
    }
  };

  return (
    <Link
      href={`/projects/${p.id}`}
      style={{ display: "block", textDecoration: "none", height: "100%" }}
    >
      <div
        className="project-card"
        style={{
          padding: 20,
          borderRadius: 20,
          border: "1px solid rgba(30,28,24,.04)",
          background: "var(--color-paper-light)",
          cursor: "pointer",
          boxShadow: "0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.16)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          transition: "transform .15s, box-shadow .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 12px 32px -16px rgba(30,28,24,.22)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.16)";
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>{p.name}</div>
          <Chip size="sm" tone={getStatusTone(p.status)} dot label={statusLabel} />
        </div>

        <div style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 14 }}>
          {p.project_assignments.slice(0, 2).map(a => a.users?.full_name).join(", ")} {p.project_type && `· ${capitalise(p.project_type)}`}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Chip size="sm" label={stageLabel} />
          {/* Variance chip placeholder to match reference look */}
          <Chip size="sm" tone={progress >= 50 ? "mint" : "amber"} label={progress >= 50 ? "On track" : "Behind"} />
        </div>

        <div style={{ marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--color-tan)",
              marginBottom: 6,
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>{elapsed ?? 0}d elapsed</span>
            {remaining !== null && (
              <span>
                {remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d left`}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--color-line)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: progress === 100 ? "var(--color-mint)" : "var(--color-ink)",
                  borderRadius: 99,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--color-ink)",
              }}
            >
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}


export default function ProjectsClient({ initialProjects, nowMs }: { initialProjects: ProjectRow[]; nowMs: number }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [scopeFilter, setScopeFilter] = useState<"All" | "design_only" | "design_and_execution">("All");

  const statuses = ["All", "Active", "On Hold", "Completed"];
  const stages = ["All", "Design", "Execution", "Completed"];
  const scopes: { value: "All" | "design_only" | "design_and_execution"; label: string }[] = [
    { value: "All", label: "All" },
    { value: "design_only", label: "Design only" },
    { value: "design_and_execution", label: "Design + Execution" },
  ];

  const filtered = initialProjects.filter((p) => {
    const sMatch = statusFilter === "All" || p.status.toLowerCase() === statusFilter.toLowerCase().replace(" ", "_");
    const stMatch = stageFilter === "All" || p.current_stage.toLowerCase() === stageFilter.toLowerCase();
    const scMatch = scopeFilter === "All" || (p.scope ?? "design_and_execution") === scopeFilter;
    return sMatch && stMatch && scMatch;
  });

  return (
    <>
      {/* Filters */}
      <div className="scroll-x-mobile" style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "center", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center" }}>Status</span>
          {statuses.map((s) => (
            <FilterChip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: "var(--color-line)", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center" }}>Stage</span>
          {stages.map((s) => (
            <FilterChip key={s} label={s} active={stageFilter === s} onClick={() => setStageFilter(s)} />
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: "var(--color-line)", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center" }}>Scope</span>
          {scopes.map((s) => (
            <FilterChip key={s.value} label={s.label} active={scopeFilter === s.value} onClick={() => setScopeFilter(s.value)} />
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-tan)", flexShrink: 0, paddingRight: 16 }}>{filtered.length} shown</div>
      </div>

      <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 18 }}>
        {filtered.map((p) => (
          <div key={p.id} style={{ gridColumn: "span 4" }}>
            <ProjectCard p={p} nowMs={nowMs} />
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--color-tan)" }}>
          <Icon name="briefcase" size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 500 }}>No projects match your filters</div>
        </div>
      )}
    </>
  );
}