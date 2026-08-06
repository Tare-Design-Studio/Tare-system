"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/atoms";
import { AssignTaskModal, type AssignableMember, type AssignableTaskProject } from "./AssignTaskModal";
import styles from "./team-access.module.css";

/**
 * Header button that opens the assign-task modal. Split out from TeamBoard
 * so it can sit in PageHeader's actions row, next to Download Report and
 * Access Matrix, instead of on its own line above the headline stats.
 */
export function AssignTaskTrigger({
  members,
  projects,
}: {
  members: AssignableMember[];
  projects: AssignableTaskProject[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={styles.button} type="button" title="Assign task" onClick={() => setOpen(true)}>
        <Icon name="clipboard" size={14} />
        <span className={styles.buttonLabel}>Assign task</span>
      </button>
      {open && (
        <AssignTaskModal
          members={members}
          projects={projects}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
