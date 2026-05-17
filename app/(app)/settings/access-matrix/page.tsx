import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Chip, Icon } from "@/components/atoms";
import { CAPABILITIES, OWNER_CAPABILITIES, TEAM_MEMBER_CAPABILITIES, SITE_ENGINEER_CAPABILITIES } from "@/lib/auth/capabilities";
import styles from "../../team/team-access.module.css";
import { PageHeader } from "../../PageHeader";

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

export default async function AccessMatrixPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const { data: userCaps } = await supabase
    .from("user_capabilities")
    .select("capability, granted, scope_project_id")
    .eq("user_id", user.id);

  const grantedSet = new Set(
    userCaps?.filter((c) => c.granted).map((c) => c.capability) ?? []
  );

  const role = profile?.role ?? "team_member";
  const isOwner = role === "owner";

  const defaultCaps =
    role === "owner"
      ? OWNER_CAPABILITIES
      : role === "site_engineer"
      ? SITE_ENGINEER_CAPABILITIES
      : TEAM_MEMBER_CAPABILITIES;

  const grouped = groupCapabilities(CAPABILITIES);
  const groupedEntries = Object.entries(grouped);

  const ROLE_BADGE: Record<string, { label: string; tone: "forest" | "indigo" | "amber" }> = {
    owner:         { label: "Owner",        tone: "forest" },
    team_member:   { label: "Team Member",  tone: "indigo" },
    site_engineer: { label: "Site Engineer", tone: "amber" },
  };
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.team_member;
  const roleRows = [
    { id: "owner", label: "Owner", caps: OWNER_CAPABILITIES, tone: "forest" as const },
    { id: "team_member", label: "Team Member", caps: TEAM_MEMBER_CAPABILITIES, tone: "indigo" as const },
    { id: "site_engineer", label: "Site Engineer", caps: SITE_ENGINEER_CAPABILITIES, tone: "amber" as const },
  ];

  return (
    <div className={styles.surface}>
      <PageHeader
        title="Access Matrix"
        subtitle={`${profile?.full_name ?? "You"} · Capability matrix`}
        actions={
          <>
            <Link href="/team" className={styles.button}>
              <Icon name="users" size={14} />
              Team
            </Link>
            <Link
              href="/team#invite-team-member"
              className={`${styles.button} ${styles.buttonPrimary} ${styles.iconOnlyButton}`}
              aria-label="Invite a team member"
              title="Invite a team member"
            >
              <Icon name="plus" size={14} />
            </Link>
          </>
        }
      >
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Chip label={badge.label} tone={badge.tone} size="sm" dot />
            {isOwner && <span style={{ fontSize: 12, color: "var(--color-tan)" }}>Full access to all capabilities</span>}
          </div>
      </PageHeader>

      {isOwner ? (
        <div className={styles.notice} style={{ marginBottom: 18 }}>
          <Icon name="shield" size={16} />
          Owner has unrestricted access to all {CAPABILITIES.length} capabilities.
        </div>
      ) : null}

      <div className={styles.grid12}>
        <div className={styles.col12}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <div className={styles.cardTitleText}>
                <h2 className="font-serif">Role Matrix</h2>
                <p>Default capabilities · dashboard reference layout</p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.matrixTable}>
                <thead>
                  <tr>
                    <th>Role</th>
                    {CAPABILITIES.map((cap) => (
                      <th key={cap} className={styles.matrixCapHead}>{cap}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roleRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Chip label={r.label} tone={r.tone} size="sm" dot />
                          {r.id === role && <span style={{ fontSize: 11, color: "var(--color-tan)" }}>Current</span>}
                        </div>
                      </td>
                      {CAPABILITIES.map((cap) => {
                        const has = r.id === "owner" || r.caps.includes(cap as never);
                        return (
                          <td key={cap} style={{ textAlign: "center", padding: "8px 6px" }}>
                            <div className={`${styles.matrixCell} ${has ? styles.matrixCellOn : ""}`}>
                              {has && <Icon name="check" size={11} />}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={styles.col12}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <div className={styles.cardTitleText}>
                <h2 className="font-serif">Your Access</h2>
                <p>Grouped capability view · managed by owner</p>
              </div>
            </div>
            <div className={styles.accessGroups}>
              {groupedEntries.map(([prefix, caps]) => {
                const categoryLabel = CATEGORY_LABELS[prefix] ?? prefix;
                const categoryGranted = caps.filter(
                  (c) => isOwner || grantedSet.has(c) || defaultCaps.includes(c as (typeof defaultCaps)[number])
                );
          return (
                <div key={prefix} className={styles.accessGroup}>
                  <div className={styles.accessGroupHeader}>
                    <h3>{categoryLabel}</h3>
                    <span>
                    {categoryGranted.length}/{caps.length}
                      </span>
                  </div>
                  <div className={styles.inlineChips}>
                    {caps.map((cap) => {
                      const granted = isOwner || grantedSet.has(cap) || defaultCaps.includes(cap as (typeof defaultCaps)[number]);
                      return (
                        <div
                          key={cap}
                          className={`${styles.capabilityPill} ${granted ? styles.capabilityPillOn : ""}`}
                        >
                          <Icon name={granted ? "check" : "x"} size={11} style={{ color: granted ? "var(--color-forest)" : "var(--color-tan)" }} />
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
        </div>

        <div className={styles.col12}>
          <p style={{ fontSize: 11, color: "var(--color-tan)", margin: 0 }}>
            Capabilities are managed by the Owner. Contact them to request changes.
          </p>
        </div>
      </div>
            </div>
  );
}
