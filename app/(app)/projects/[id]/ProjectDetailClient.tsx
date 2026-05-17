"use client";

import React, { useState } from "react";
import { Avatar, Chip, Icon } from "@/components/atoms";
import styles from "./project-detail.module.css";

interface TeamStreamItem {
  id: string;
  update_type: string;
  body: string;
  created_at: string;
  users: {
    id: string;
    full_name: string;
    role: string;
  } | null;
}

interface ProjectDetailClientProps {
  updates: TeamStreamItem[];
  siteCheckIns: any[];
}

export default function ProjectDetailClient({ updates, siteCheckIns }: ProjectDetailClientProps) {
  const [teamRole, setTeamRole] = useState<"Team Member" | "Site Engineer">("Team Member");

  const filteredUpdates = teamRole === "Team Member"
    ? updates.filter(u => u.update_type !== "check_in") // Assuming check_ins are for site engineers
    : updates.filter(u => u.update_type === "check_in" || u.update_type === "site_note");

  // Fallback if update_type doesn't perfectly map
  const displayUpdates = teamRole === "Team Member"
    ? updates.slice(0, 5)
    : updates.filter(u => u.update_type === 'progress' || u.update_type === 'note').slice(0, 5);

  return (
    <div className={styles.card}>
      <div className={styles.pipelineLabel} style={{ marginBottom: 20 }}>
        <div className={styles.cardTitle} style={{ margin: 0 }}>Team Stream</div>
        <div className={styles.streamToggle}>
          <button
            onClick={() => setTeamRole("Team Member")}
            className={`${styles.streamToggleBtn} ${teamRole === "Team Member" ? styles.streamToggleBtnActive : ""}`}
          >
            Team Member
          </button>
          <button
            onClick={() => setTeamRole("Site Engineer")}
            className={`${styles.streamToggleBtn} ${teamRole === "Site Engineer" ? styles.streamToggleBtnActive : ""}`}
          >
            Site Engineer
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {displayUpdates.length > 0 ? displayUpdates.map((u, i) => (
          <div key={u.id} className={styles.streamItem}>
            <Avatar
              name={u.users?.full_name || "Unknown"}
              size={28}
              tone={u.update_type === 'image' ? 'teal' : 'forest'}
            />
            <div className={styles.streamContent}>
              <div className={styles.streamHeader}>
                {u.users?.full_name || "Unknown"}
                <span className={styles.streamTime}>
                  {new Date(u.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>
              <div className={styles.streamBody}>
                {u.body}
              </div>
              {u.update_type === 'image' && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ width: 80, height: 60, borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                    <Icon name="image" size={20} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )) : (
          <div style={{ color: "var(--muted)", fontSize: 13, fontStyle: "italic", padding: "10px 0" }}>
            No recent activity for this role.
          </div>
        )}
      </div>
    </div>
  );
}
