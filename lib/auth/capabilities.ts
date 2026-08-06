// Single source of truth for capability strings.
// Any new capability must be added here AND to supabase/seed/001_seed.sql.

export const CAPABILITIES = [
  // Projects
  "project:create",
  "project:edit",
  "project:delete",
  "project:view_assigned",
  "project:view_all",
  "project:change_stage",

  // Enquiries (Owner-only pipeline)
  "enquiry:view",
  "enquiry:create",
  "enquiry:edit",
  "enquiry:add_remark",
  "enquiry:set_reminder",

  // Customers
  "customer:view",
  "customer_payments:view",
  "customer_payments:edit",
  "customer_payments:create_schedule",

  // Team management
  "team:create_user",
  "team:edit_user",
  "team:deactivate_user",
  "team:assign_to_project",
  // Restricted /team — members list, who-is-on-what, project assignment.
  // No salary / attendance / KPI (migration 096).
  "team:coordinate",

  // Materials
  "materials:plan",
  "materials:consume",
  "materials:view",

  // Progress & checklists
  "progress:update",
  "progress:view",
  "checklist:edit",

  // Checkpoint progression (start / complete milestones)
  "checkpoint:progress",

  // Expenses
  "expenses:create",
  "expenses:view",
  "expenses:approve",

  // Finance
  "finance:view_dashboard",
  "finance:export",

  // Images / media
  "images:upload",
  "images:view",
  "images:select_for_customer",

  // Bridge (per-project chat)
  "bridge:read",
  "bridge:write",

  // Calendar
  "calendar:view_own",
  "calendar:view_all",
  "calendar:create_for_others",

  // Daily tasks
  "daily_tasks:write_own",
  "daily_tasks:view_all",
  "daily_tasks:export_own",
  "daily_tasks:export_all",

  // Broadcasts
  "broadcast:create",
  "broadcast:receive",

  // Site check-in (Site Engineers)
  "site_check_in:write",
  "site_check_in:view_all",
  "site_check_in:override_geofence",

  // Office attendance (Team Members)
  "office_attendance:write_own",
  "office_attendance:view_all",
  "office_attendance:configure",

  // Member tasks (persistent, multi-day)
  "member_tasks:write_own",
  "member_tasks:view_all",

  // Owner → member task assignment + review (migration 083)
  "tasks:assign",

  // Personal reminders (strictly private)
  "personal_reminders:write_own",

  // Tag-based sub-roles
  "team_member_tags:manage",

  // Project tables
  "project_table:view",
  "project_table:edit",
  "project_table:create",
  "table_preset:manage",

  // Public intake form
  "intake_form:configure",

  // Audit
  "audit_log:view",
  "audit_log:export",

  // Leave (migration 088)
  "leave:request",
  "leave:view_all",
  "leave:approve",

  // KPI scoring policy (migration 090)
  "performance:configure",

  // Access control — non-delegable; Owner only; trigger enforces
  "access_control:manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// Default capability sets per role
export const OWNER_CAPABILITIES: Capability[] = CAPABILITIES as unknown as Capability[];

export const TEAM_MEMBER_CAPABILITIES: Capability[] = [
  "project:view_assigned",
  "progress:view",
  "bridge:read",
  "bridge:write",
  "images:upload",
  "images:view",
  "calendar:view_own",
  "daily_tasks:write_own",
  "daily_tasks:export_own",
  "broadcast:receive",
  "project_table:view",
  "project_table:edit",
  "office_attendance:write_own",
  "member_tasks:write_own",
  "personal_reminders:write_own",
  "leave:request",
];

// Finance / payments capabilities — hidden from the Admin tag.
export const FINANCE_CAPABILITIES: Capability[] = [
  "finance:view_dashboard",
  "finance:export",
  "expenses:create",
  "expenses:view",
  "expenses:approve",
  "customer_payments:view",
  "customer_payments:edit",
  "customer_payments:create_schedule",
];

// Capabilities a TAG may never confer — the owner grants these per-user through
// the Access Matrix instead.
//   access_control:manage — non-delegable, Owner only.
//   tasks:assign (087)    — assigning work carries the power to review it, and
//     review verdicts drive the KPI. Before 087 the accountant / admin /
//     project_manager tags conferred it silently, so applying a tag handed out
//     sign-off authority the owner never explicitly chose. Keep in sync with
//     tag_capability_set() in migration 087.
//   leave:approve (088)   — deciding leave is a management act; a tag should not
//     silently confer it. The DB guard blocks self-approval, but who may approve
//     at all stays an explicit per-user grant.
//   performance:configure (090) — rewriting the KPI weights changes everyone's
//     score. Same reasoning as tasks:assign: keep it off the tag path.
//   team:coordinate (096)  — opens the team page (redacted) and the project
//     assignment panel. Who may see the whole team's workload and move people
//     between projects is the owner's explicit call, not a side effect of a tag.
const TAG_EXCLUDED_CAPABILITIES: Capability[] = [
  "access_control:manage",
  "tasks:assign",
  "leave:approve",
  "performance:configure",
  "team:coordinate",
];

const ALL_DELEGABLE_CAPABILITIES: Capability[] = CAPABILITIES.filter(
  (c) => !TAG_EXCLUDED_CAPABILITIES.includes(c)
);

// Extra capabilities granted per tag (owner assigns these via team_member_tags)
export const TAG_CAPABILITIES: Record<string, Capability[]> = {
  // Accountant — full access (every navbar page + capability), like the Owner view.
  accountant: ALL_DELEGABLE_CAPABILITIES,
  // Admin — same as accountant but all finance / payments capabilities hidden.
  admin: ALL_DELEGABLE_CAPABILITIES.filter(
    (c) => !FINANCE_CAPABILITIES.includes(c)
  ),
  project_manager: [
    "project:create",
    "project:edit",
    "project:change_stage",
    "project:view_all",
    "team:assign_to_project",
    "expenses:view",
    "expenses:approve",
    "checkpoint:progress",
    "customer:view",
    "customer_payments:view",
    "daily_tasks:view_all",
    "member_tasks:view_all",
    // "tasks:assign" removed by 087 — owner-granted only, see
    // TAG_EXCLUDED_CAPABILITIES above.
    "office_attendance:view_all",
  ],
};

export const SITE_ENGINEER_CAPABILITIES: Capability[] = [
  "project:view_assigned",
  "bridge:read",
  "bridge:write",
  "materials:consume",
  "materials:view",
  "progress:update",
  "progress:view",
  "checklist:edit",
  "expenses:create",
  "expenses:view",
  "images:upload",
  "images:view",
  "site_check_in:write",
  "office_attendance:write_own",
  "calendar:view_own",
  "broadcast:receive",
  "project_table:view",
  "project_table:edit",
  "leave:request",
];
