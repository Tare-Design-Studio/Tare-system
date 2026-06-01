import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Chip, Icon } from "@/components/atoms";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import styles from "../../team/team-access.module.css";
import { PageHeader } from "../../PageHeader";
import { AccessMatrixEditor, type Member } from "./AccessMatrixEditor";

export const metadata = { title: "Access Matrix — ArchitectOS" };

const CATEGORY_LABELS: Record<string, string> = {
  project:             "Projects",
  enquiry:             "Enquiries",
  customer:            "Customers",
  customer_payments:   "Customer Payments",
  team:                "Team Management",
  materials:           "Materials",
  progress:            "Progress & Checklists",
  checklist:           "Checklists",
  expenses:            "Expenses",
  finance:             "Finance",
  images:              "Images & Media",
  bridge:              "Bridge (Project Chat)",
  calendar:            "Calendar",
  daily_tasks:         "Daily Tasks",
  broadcast:           "Broadcasts",
  site_check_in:       "Site Check-In",
  office_attendance:   "Office Attendance",
  project_table:       "Project Tables",
  table_preset:        "Table Presets",
  intake_form:         "Intake Form",
  audit_log:           "Audit Log",
  access_control:      "Access Control",
};

type Tag = "accountant" | "admin" | "project_manager";

function groupCapabilities(caps: readonly string[]) {
  const groups: Record<string, string[]> = {};
  for (const cap of caps) {
    const prefix = cap.split(":")[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(cap);
  }
  return groups;
}

function actionLabel(capability: string): string {
  const action = capability.split(":")[1] ?? capability;
  return action.replace(/_/g, " ");
}

// Grouped capability cards — one card per category, each capability shown as a
// pill ticked when granted. `grantedSet` decides ticks (Owner: every capability).
function CapabilityCards({
  grantedSet,
  subtitle,
}: {
  grantedSet: (cap: string) => boolean;
  subtitle: string;
}) {
  const groupedEntries = Object.entries(groupCapabilities(CAPABILITIES));
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Capabilities</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className={styles.accessGroups}>
        {groupedEntries.map(([prefix, caps]) => {
          const categoryLabel = CATEGORY_LABELS[prefix] ?? prefix;
          const categoryGranted = caps.filter((c) => grantedSet(c));
          return (
            <div key={prefix} className={styles.accessGroup}>
              <div className={styles.accessGroupHeader}>
                <h3>{categoryLabel}</h3>
                <span>{categoryGranted.length}/{caps.length}</span>
              </div>
              <div className={styles.inlineChips}>
                {caps.map((cap) => {
                  const granted = grantedSet(cap);
                  return (
                    <div
                      key={cap}
                      className={`${styles.capabilityPill} ${granted ? styles.capabilityPillOn : ""}`}
                    >
                      <Icon
                        name={granted ? "check" : "x"}
                        size={11}
                        style={{ color: granted ? "var(--color-forest)" : "var(--color-tan)" }}
                      />
                      <span>{actionLabel(cap)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function AccessMatrixPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "team_member";
  // Access Matrix is owner-only — no one else may view it.
  if (role !== "owner") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
    const [membersRes, tagsRes, capsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, role")
        .is("deleted_at", null)
        .order("full_name"),
      db.from("team_member_tags").select("user_id, tag"),
      db
        .from("user_capabilities")
        .select("user_id, capability, granted, scope_project_id"),
    ]);

    const members = (membersRes.data ?? []) as Member[];

    const tagByUser: Record<string, Tag | null> = {};
    for (const row of (tagsRes.data ?? []) as { user_id: string; tag: Tag }[]) {
      tagByUser[row.user_id] = row.tag;
    }

    const capsByUser: Record<string, string[]> = {};
    for (const row of (capsRes.data ?? []) as {
      user_id: string; capability: string; granted: boolean; scope_project_id: string | null;
    }[]) {
      if (!row.granted || row.scope_project_id !== null) continue;
      (capsByUser[row.user_id] ??= []).push(row.capability);
    }

    return (
      <div className={styles.surface}>
        <PageHeader
          title="Access Matrix"
          subtitle="Assign tags & capabilities · Owner controls"
          actions={
            <Link href="/team" className={styles.button}>
              <Icon name="users" size={14} />
              Team
            </Link>
          }
        >
          <div style={{ marginTop: 12 }}>
            <Chip label="Owner" tone="forest" size="sm" dot />
          </div>
        </PageHeader>

        <div className={styles.notice} style={{ marginBottom: 18 }}>
          <Icon name="shield" size={16} />
          Assign a tag (Accountant, Admin, Project Manager) or fine-tune individual
          capabilities. Every change is confirmed twice before it is saved.
        </div>

        <div className={styles.grid12}>
          <div className={styles.col12}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>
                <div className={styles.cardTitleText}>
                  <h2 className="font-serif">Team Members</h2>
                  <p>Role · tag · capability overrides</p>
                </div>
              </div>
              <AccessMatrixEditor
                members={members}
                tagByUser={tagByUser}
                capsByUser={capsByUser}
              />
            </div>
          </div>

          <div className={styles.col12}>
            <CapabilityCards
              grantedSet={() => true}
              subtitle="All capabilities · Owner has full access"
            />
          </div>
        </div>
      </div>
    );
  }
