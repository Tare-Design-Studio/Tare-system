/**
 * seed-demo.ts — reversible demonstration data for the LIVE Tare client.
 *
 * Enriches a focused subset of the real 45 projects + real 20 users with full
 * coverage: customers, enquiries (+reminders), milestones (checkpoints+items),
 * payments (schedule+records), project progress, drawing register + site
 * execution tables, updates (incl. site images), material plan/consumption,
 * expenses, site check-ins (incl. per-site hours + one out-of-geofence),
 * bridge messages, calendar events, broadcasts, member/daily tasks, personal
 * reminders, attendance, and monthly performance.
 *
 * Every demo CHILD row uses the fixed `dec0de00-…` UUID namespace. Real project
 * rows are enriched in place (customer_id/budget/type/dates/whatsapp set); the
 * generated teardown nulls those columns back and deletes all namespace rows.
 *
 * Idempotent: re-running deletes its own namespace first, then re-inserts.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-demo.ts          # apply
 *   DATABASE_URL=... npx tsx scripts/seed-demo.ts --sql    # print SQL only, no apply
 */
import { Client } from "pg";
import { writeFileSync } from "fs";
import { config } from "dotenv";
config();

const TENANT = "d4784db6-9a2d-4075-97b5-14daaa9026ab";
const SAL_TEMPLATE = "0bd96e67-059a-4f9c-8fc1-f3e97961cd56";
const DR_PRESET = "af4c7998-ea1e-48d8-80a5-ea1d3fd16e54"; // Drawing Register

// Drawing Register column ids (cells JSONB keyed by these)
const DR_COL = {
  sl: "790c5ebe-55fd-449d-b8f1-6b1e43770962",
  no: "3f899fe5-ea7b-4c3f-9435-7c9077ec6a26",
  desc: "be5bd480-7bcd-471e-bed6-efde859eff7d",
  drawn: "8d1e120b-336c-43e0-b30b-532a9d61d0b5",
  checked: "747e1f63-61cf-4d43-a3ac-9521c353723a",
  rev: "3914323e-8a29-4bcb-ad66-2f69a7ca6ad4",
  issued: "b5cebc5e-7666-4f64-b804-3549bc42f714",
};

// ---- real users ----
const U = {
  owner: "b58964be-e03a-45fb-8b0f-cfbe5f3fdae7", // Nayan Kumar H.T.
  anitha: "5990bc5b-777b-44cc-98de-e2ac8586c205",
  bhoomika: "2bff9ab5-a910-41f0-9fec-c1484faa26ba",
  divya: "bc74aea8-a908-431d-9d22-4c54430add17",
  sowmiya: "6e79672b-c23a-4d2c-8759-fe45d178d139",
  manasa: "685055d6-0f01-4dc3-9e26-ab9025927ab0", // accountant tag
  mirza: "82c2605a-d3dc-4988-8b29-72f1d67b5699",
  nidhi: "dac10b84-0a9d-4827-a6a3-87c09a49ff07",
  noor: "08cf024a-c044-4ee1-b3ec-5599eba35161",
  shanthi: "dbf4221e-d956-47b6-8cbd-a31c23fa0e19",
  usha: "3b9cd8fb-f240-4d96-b6c0-41a4d4f0aee9",
  zahra: "1e01d00e-f41a-4b33-b280-3e1c40243701",
  adarsha: "8dbc853e-0b28-4e50-8825-4ba3aa147043", // SE, project_manager tag
  manjunath: "d300cf8a-5779-4723-ac52-e19dcf74b2ad", // SE
  siddiq: "b0934fa5-b959-4554-8a65-7c6f9053c639", // SE
  srinivas: "b912111b-3019-49dd-8305-3c19f8d5be2a", // SE
};

// ---- real projects to enrich ----
// execution-stage (site-engineer rich) + design-stage
const P = {
  harsha: "2ccbf822-3d4c-42dc-8aa1-df1c92862396", // exec
  varun: "145eb7d1-6dde-4a6d-b640-a5e5f86ac4ff", // exec
  niharika: "da8ef362-22c0-4dae-9eb5-0865179ec6a0", // exec (NIHARIKA)
  suresh: "09040ba3-6014-4f85-8d93-933b5686175e", // exec (SURESH)
  ranga: "3c5c733d-4fa6-46f7-a361-0206ffb1122f", // exec (RANGA SRINIVAS)
  mohan: "93f6455e-2cbb-4127-a3c0-3965e5e3d8f1", // design
  prakash: "de633dc0-b8d2-4a16-b2c4-c745b9f83da1", // design
  sheela: "27ab356d-dd6a-4cd5-89b2-17c057702d17", // design
  mgr: "36a9e90d-3d66-403f-bb71-33554d2251ef", // design (M.G.R RESTAURANT - commercial)
};

// ---- namespaced uuid helper ----
const id = (tag: string, n: number) =>
  `dec0de00-${tag}-4000-8000-${String(n).padStart(12, "0")}`;

// ---- date helpers (anchored to 2026-06-11) ----
const TODAY = new Date("2026-06-11T09:00:00+05:30");
const day = (offset: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d;
};
const dateStr = (offset: number) => day(offset).toISOString().slice(0, 10);
const tsStr = (offset: number, hour = 11, min = 0) => {
  const d = day(offset);
  d.setHours(hour - 5, min - 30, 0, 0); // IST → UTC store
  return d.toISOString();
};
const monthStart = (mOffset: number) => {
  const d = new Date(TODAY);
  d.setMonth(d.getMonth() + mOffset, 1);
  return d.toISOString().slice(0, 10);
};

// ---- SQL emit ----
const lines: string[] = [];
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const v = (x: any) =>
  x === null || x === undefined
    ? "NULL"
    : typeof x === "number"
    ? String(x)
    : typeof x === "boolean"
    ? (x ? "TRUE" : "FALSE")
    : q(String(x));
function ins(table: string, row: Record<string, any>) {
  const cols = Object.keys(row);
  lines.push(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols
      .map((c) => v(row[c]))
      .join(", ")});`
  );
}

// =====================================================================
// Build the seed
// =====================================================================
lines.push("BEGIN;");
lines.push("SET LOCAL session_replication_role = replica; -- bypass auth.uid()-based RLS; we provide all cols");

// ----- teardown of own namespace first (idempotent) -----
const NS_TABLES = [
  "team_performance_monthly", "attendance_logs", "owner_broadcast_recipients",
  "owner_broadcasts", "team_daily_tasks", "member_tasks", "personal_reminders",
  "calendar_events", "bridge_messages", "media_assets", "updates",
  "site_check_ins", "expenses", "material_consumption", "material_plan",
  "payment_records", "payment_schedule", "checkpoint_items", "project_checkpoints",
  "project_table_rows", "project_table_columns", "project_tables",
  "project_assignments", "enquiry_reminders", "enquiries", "customers",
];
lines.push("-- idempotent: clear this namespace first");
for (const t of NS_TABLES)
  lines.push(`DELETE FROM ${t} WHERE id::text LIKE 'dec0de00-%';`);
// idempotent: revert demo enrichment on ALL projects (real seed left these null).
// The base Tare project seed set only name/slug/scope/stage/status, so nulling
// customer_id/type/budget/dates/whatsapp on every row only undoes demo enrichment.
lines.push(
  "UPDATE projects SET customer_id=NULL, project_type=NULL, budget_total=NULL, start_date=NULL, expected_end_date=NULL, whatsapp_group_url=NULL WHERE customer_id IS NOT NULL OR project_type IS NOT NULL OR budget_total IS NOT NULL OR whatsapp_group_url IS NOT NULL;"
);

// ----- CUSTOMERS (10) -----
type Cust = { key: string; n: number; name: string; phone: string; email: string; address: string; portal?: boolean };
const customers: Cust[] = [
  { key: "harsha", n: 1, name: "Harsha Gowda", phone: "+919844011001", email: "harsha.gowda@gmail.com", address: "No. 14, 3rd Cross, Vijayanagar, Mysuru 570017", portal: true },
  { key: "varun", n: 2, name: "Varun Shetty", phone: "+919844011002", email: "varun.shetty@gmail.com", address: "Plot 8, Gokulam 2nd Stage, Mysuru 570002", portal: true },
  { key: "niharika", n: 3, name: "Niharika Rao", phone: "+919844011003", email: "niharika.rao@outlook.com", address: "221, Saraswathipuram, Mysuru 570009", portal: true },
  { key: "suresh", n: 4, name: "Suresh Babu", phone: "+919844011004", email: "suresh.babu@gmail.com", address: "47, Kuvempunagar, Mysuru 570023" },
  { key: "ranga", n: 5, name: "Ranga Srinivas", phone: "+919844011005", email: "ranga.srinivas@gmail.com", address: "12, Jayalakshmipuram, Mysuru 570012" },
  { key: "mohan", n: 6, name: "Mohan Kumar", phone: "+919844011006", email: "mohan.kumar@gmail.com", address: "9, Hebbal Industrial Area, Mysuru 570016" },
  { key: "prakash", n: 7, name: "Prakash Murthy", phone: "+919844011007", email: "prakash.murthy@gmail.com", address: "63, Vidyaranyapuram, Mysuru 570008" },
  { key: "sheela", n: 8, name: "Sheela Nanjappa", phone: "+919844011008", email: "sheela.n@gmail.com", address: "5, Yadavagiri, Mysuru 570020" },
  { key: "mgr", n: 9, name: "M.G. Rajendra", phone: "+919844011009", email: "mgr.restaurant@gmail.com", address: "Sayyaji Rao Road, Mysuru 570001", portal: true },
  { key: "lead10", n: 10, name: "Anand Krishnan", phone: "+919844011010", email: "anand.k@gmail.com", address: "31, Lakshmipuram, Mysuru 570004" },
];
const custId: Record<string, string> = {};
for (const c of customers) {
  custId[c.key] = id("0001", c.n);
  ins("customers", {
    id: custId[c.key], tenant_id: TENANT, name: c.name, phone: c.phone,
    email: c.email, address: c.address,
    customer_portal_enabled: !!c.portal,
    // portal hash must be exactly 16 chars (get_customer_portal_summary length check)
    customer_portal_hash: c.portal ? ("dec0de" + String(c.n).padStart(10, "0")) : null,
    customer_portal_hash_generated_at: c.portal ? tsStr(-40) : null,
    created_at: tsStr(-90 + c.n),
  });
}

// link enriched projects → customers + fill metadata
type Enrich = { key: string; pid: string; cust: string; type: string; budget: number; start: number; end: number; wa?: string };
const enrich: Enrich[] = [
  { key: "harsha", pid: P.harsha, cust: "harsha", type: "residential", budget: 4200000, start: -210, end: 90, wa: "https://chat.whatsapp.com/HarshaVilla2026" },
  { key: "varun", pid: P.varun, cust: "varun", type: "residential", budget: 5600000, start: -240, end: 45, wa: "https://chat.whatsapp.com/VarunResidence" },
  { key: "niharika", pid: P.niharika, cust: "niharika", type: "residential", budget: 3800000, start: -180, end: 120 },
  { key: "suresh", pid: P.suresh, cust: "suresh", type: "residential", budget: 4900000, start: -200, end: 60 },
  { key: "ranga", pid: P.ranga, cust: "ranga", type: "residential", budget: 5200000, start: -220, end: 30 },
  { key: "mohan", pid: P.mohan, cust: "mohan", type: "residential", budget: 3200000, start: -75, end: 200 },
  { key: "prakash", pid: P.prakash, cust: "prakash", type: "residential", budget: 2900000, start: -50, end: 220 },
  { key: "sheela", pid: P.sheela, cust: "sheela", type: "interior", budget: 1800000, start: -40, end: 160 },
  { key: "mgr", pid: P.mgr, cust: "mgr", type: "commercial", budget: 7400000, start: -120, end: 150 },
];
for (const e of enrich) {
  lines.push(
    `UPDATE projects SET customer_id=${v(custId[e.cust])}, project_type=${v(e.type)}, budget_total=${e.budget}, start_date=${v(dateStr(e.start))}, expected_end_date=${v(dateStr(e.end))}${e.wa ? `, whatsapp_group_url=${v(e.wa)}` : ""} WHERE id=${v(e.pid)};`
  );
}
const isExec = (k: string) => ["harsha", "varun", "niharika", "suresh", "ranga"].includes(k);

// ----- ENQUIRIES (12, full pipeline) -----
type Enq = { n: number; name: string; phone: string; email: string; source: string; status: string; msg: string; created: number; conv?: string };
const enquiries: Enq[] = [
  { n: 1, name: "Anand Krishnan", phone: "+919844011010", email: "anand.k@gmail.com", source: "referral", status: "new", msg: "Looking for a 3BHK villa design on a 40x60 site in Lakshmipuram.", created: -2 },
  { n: 2, name: "Deepa Iyer", phone: "+919900022011", email: "deepa.iyer@gmail.com", source: "instagram", status: "new", msg: "Interested in interior design for a 2BHK apartment.", created: -4 },
  { n: 3, name: "Rakesh Jain", phone: "+919900022012", email: "rakesh.jain@gmail.com", source: "website", status: "quotation_sent", msg: "Need a duplex house design, budget around 50L.", created: -9 },
  { n: 4, name: "Priyanka Bose", phone: "+919900022013", email: "priyanka.bose@gmail.com", source: "whatsapp", status: "quotation_sent", msg: "Farmhouse design on 1 acre near Nanjangud.", created: -12 },
  { n: 5, name: "Sandeep Reddy", phone: "+919900022014", email: "sandeep.reddy@gmail.com", source: "referral", status: "awaiting_approval", msg: "Commercial showroom, ground + 2 floors on Sayyaji Rao Road.", created: -18 },
  { n: 6, name: "Lakshmi Narayan", phone: "+919900022015", email: "lakshmi.n@gmail.com", source: "youtube", status: "awaiting_approval", msg: "Renovation of an old house in Saraswathipuram.", created: -20 },
  { n: 7, name: "Faisal Ahmed", phone: "+919900022016", email: "faisal.ahmed@gmail.com", source: "walk_in", status: "closed_for_discussion", msg: "Wants to discuss vastu-compliant layout before committing.", created: -25 },
  { n: 8, name: "Vidya Shankar", phone: "+919900022017", email: "vidya.s@gmail.com", source: "instagram", status: "lost", msg: "Went with another firm — budget mismatch.", created: -35 },
  { n: 9, name: "Gopal Hegde", phone: "+919900022018", email: "gopal.hegde@gmail.com", source: "website", status: "lost", msg: "Postponed the project indefinitely.", created: -45 },
  { n: 10, name: "M.G. Rajendra", phone: "+919844011009", email: "mgr.restaurant@gmail.com", source: "referral", status: "converted", msg: "Restaurant fit-out on Sayyaji Rao Road.", created: -125, conv: "mgr" },
  { n: 11, name: "Sheela Nanjappa", phone: "+919844011008", email: "sheela.n@gmail.com", source: "instagram", status: "converted", msg: "Full interior for a 3BHK in Yadavagiri.", created: -48, conv: "sheela" },
  { n: 12, name: "Prakash Murthy", phone: "+919844011007", email: "prakash.murthy@gmail.com", source: "referral", status: "converted", msg: "New residential build in Vidyaranyapuram.", created: -58, conv: "prakash" },
];
const enqId: Record<number, string> = {};
const assignees = [U.divya, U.anitha, U.sowmiya, U.noor, U.zahra];
for (const e of enquiries) {
  enqId[e.n] = id("0002", e.n);
  ins("enquiries", {
    id: enqId[e.n], tenant_id: TENANT, name: e.name, phone: e.phone,
    phone_normalized: e.phone, email: e.email, source: e.source,
    status: e.status, message: e.msg, created_via: "manual",
    created_by: assignees[e.n % assignees.length],
    converted_to_customer_id: e.conv ? custId[e.conv] : null,
    created_at: tsStr(e.created),
  });
}

// ----- ENQUIRY REMINDERS (mix; some on enquiries, some on customers = site visits) -----
type Rem = { n: number; enq?: number; cust?: string; user: string; at: number; hour: number; msg: string; cat: string; pri: string; done?: boolean };
const reminders: Rem[] = [
  { n: 1, enq: 1, user: U.divya, at: 1, hour: 11, msg: "Call Anand to schedule first site visit", cat: "call", pri: "high" },
  { n: 2, enq: 3, user: U.anitha, at: 2, hour: 15, msg: "Follow up on duplex quotation with Rakesh", cat: "quotation", pri: "normal" },
  { n: 3, enq: 4, user: U.sowmiya, at: 3, hour: 10, msg: "Send revised farmhouse quote to Priyanka", cat: "quotation", pri: "high" },
  { n: 4, enq: 5, user: U.owner, at: 1, hour: 16, msg: "Showroom design approval meeting with Sandeep", cat: "meeting", pri: "high" },
  { n: 5, enq: 6, user: U.noor, at: 4, hour: 12, msg: "Renovation feasibility call with Lakshmi", cat: "call", pri: "normal" },
  { n: 6, enq: 7, user: U.owner, at: 5, hour: 11, msg: "Vastu layout discussion with Faisal", cat: "meeting", pri: "normal" },
  // site visits (customer-linked) — surface on site engineer dashboard
  { n: 7, cust: "harsha", user: U.srinivas, at: 1, hour: 10, msg: "Site visit — first-floor slab inspection", cat: "site_visit", pri: "high" },
  { n: 8, cust: "varun", user: U.manjunath, at: 2, hour: 9, msg: "Site visit — plastering quality check", cat: "site_visit", pri: "normal" },
  { n: 9, cust: "niharika", user: U.siddiq, at: 3, hour: 11, msg: "Site visit — electrical conduit walkthrough", cat: "site_visit", pri: "normal" },
  { n: 10, cust: "suresh", user: U.adarsha, at: 4, hour: 10, msg: "Site visit — foundation curing review", cat: "site_visit", pri: "high" },
  { n: 11, cust: "ranga", user: U.srinivas, at: 6, hour: 15, msg: "Site visit — final finishing snag list", cat: "site_visit", pri: "high" },
  { n: 12, cust: "harsha", user: U.divya, at: -3, hour: 14, msg: "Drawing handover meeting (completed)", cat: "drawing", pri: "normal", done: true },
];
for (const r of reminders) {
  ins("enquiry_reminders", {
    id: id("0003", r.n), tenant_id: TENANT,
    enquiry_id: r.enq ? enqId[r.enq] : null,
    customer_id: r.cust ? custId[r.cust] : null,
    user_id: r.user, remind_at: tsStr(r.at, r.hour),
    message: r.msg, category: r.cat, priority: r.pri,
    is_done: !!r.done, done_at: r.done ? tsStr(r.at, r.hour) : null,
    created_at: tsStr(Math.min(r.at - 2, -1)),
  });
}

// ----- PROJECT ASSIGNMENTS -----
// exec projects: a lead architect + a site engineer (+ design support); design projects: lead + support.
let asgN = 0;
const seByProj: Record<string, string> = {
  harsha: U.srinivas, varun: U.manjunath, niharika: U.siddiq, suresh: U.adarsha, ranga: U.srinivas,
};
const leadByProj: Record<string, string> = {
  harsha: U.divya, varun: U.anitha, niharika: U.sowmiya, suresh: U.noor, ranga: U.zahra,
  mohan: U.divya, prakash: U.anitha, sheela: U.bhoomika, mgr: U.sowmiya,
};
const supportByProj: Record<string, string> = {
  harsha: U.bhoomika, varun: U.nidhi, niharika: U.shanthi, suresh: U.usha, ranga: U.mirza,
  mohan: U.nidhi, prakash: U.usha, sheela: U.shanthi, mgr: U.mirza,
};
for (const e of enrich) {
  // lead architect 60%
  ins("project_assignments", { id: id("0004", ++asgN), tenant_id: TENANT, project_id: e.pid, user_id: leadByProj[e.key], role_on_project: "lead_architect", contribution_pct: 60, assigned_by: U.owner, assigned_at: tsStr(e.start) });
  // design support 40%
  ins("project_assignments", { id: id("0004", ++asgN), tenant_id: TENANT, project_id: e.pid, user_id: supportByProj[e.key], role_on_project: "design_support", contribution_pct: 40, assigned_by: U.owner, assigned_at: tsStr(e.start) });
  // site engineer (exec only) — separate role, pct null
  if (isExec(e.key))
    ins("project_assignments", { id: id("0004", ++asgN), tenant_id: TENANT, project_id: e.pid, user_id: seByProj[e.key], role_on_project: "site_engineer", contribution_pct: null, assigned_by: U.owner, assigned_at: tsStr(e.start) });
}

// ----- CHECKPOINTS (from SAL template) + payment schedule + items -----
const salItems = [
  { name: "Project Kickoff & Initial Survey", off: 0, appr: false, pct: 10 },
  { name: "Concept Design Submission", off: 30, appr: true, pct: 15 },
  { name: "Design Development Approval", off: 60, appr: true, pct: 15 },
  { name: "Construction Documentation", off: 120, appr: false, pct: 15 },
  { name: "Permit & Regulatory Approvals", off: 150, appr: false, pct: 5 },
  { name: "Construction Phase Completion", off: 240, appr: true, pct: 30 },
  { name: "Final Project Handover", off: 270, appr: true, pct: 10 },
];
// how many checkpoints are done per project (drives progress %)
const progressByProj: Record<string, number> = {
  harsha: 5, varun: 6, niharika: 4, suresh: 5, ranga: 6, // exec — well advanced
  mohan: 2, prakash: 1, sheela: 2, mgr: 3, // design — earlier
};
let cpN = 0, ckN = 0, psN = 0, prN = 0;
const cpItemsText = [
  "Site measurement & survey complete",
  "Client brief documented & signed off",
  "Drawings uploaded to register",
  "Internal QA review done",
];
for (const e of enrich) {
  const done = progressByProj[e.key];
  const budget = e.budget;
  salItems.forEach((s, i) => {
    const seq = i + 1;
    const cpid = id("0005", ++cpN);
    const psid = id("0006", ++psN);
    const isDone = i < done;
    const inProgress = i === done; // next one is under way
    const dueOff = e.start + s.off;
    // payment schedule row (milestone-linked)
    ins("payment_schedule", {
      id: psid, tenant_id: TENANT, project_id: e.pid,
      milestone_name: s.name, amount_due: Math.round((budget * s.pct) / 100),
      due_date: dateStr(dueOff), sequence_order: seq,
      notes: `${s.pct}% on ${s.name.toLowerCase()}`,
      triggered_at: isDone ? tsStr(dueOff) : null,
      created_at: tsStr(e.start),
    });
    // checkpoint (insert in final state — progression trigger is BEFORE UPDATE only)
    ins("project_checkpoints", {
      id: cpid, tenant_id: TENANT, project_id: e.pid, name: s.name,
      sequence_order: seq, due_date: dateStr(dueOff),
      requires_approval: s.appr,
      started_at: isDone || inProgress ? tsStr(dueOff - 5) : null,
      completed_at: isDone ? tsStr(dueOff) : null,
      approved_at: isDone && s.appr ? tsStr(dueOff + 1) : null,
      approved_by: isDone && s.appr ? U.owner : null,
      triggers_payment_id: psid,
      completion_percentage: isDone ? 100 : inProgress ? 45 : 0,
      remarks: isDone ? "Completed and approved." : inProgress ? "In progress." : null,
      created_at: tsStr(e.start),
    });
    // checkpoint items
    cpItemsText.forEach((t, j) => {
      ins("checkpoint_items", {
        id: id("0007", ++ckN), tenant_id: TENANT, checkpoint_id: cpid,
        description: t, is_complete: isDone || (inProgress && j < 2),
        completed_by: isDone || (inProgress && j < 2) ? leadByProj[e.key] : null,
        completed_at: isDone ? tsStr(dueOff) : inProgress && j < 2 ? tsStr(-3) : null,
      });
    });
  });
}

// ----- PAYMENT RECORDS (for triggered/done milestones) -----
const methods = ["bank", "neft", "upi", "cheque"];
let recIdx = 0;
for (const e of enrich) {
  const done = progressByProj[e.key];
  salItems.forEach((s, i) => {
    if (i >= done) return;
    const dueOff = e.start + s.off;
    ins("payment_records", {
      id: id("0008", ++prN), tenant_id: TENANT,
      payment_schedule_id: id("0006", enrich.indexOf(e) * 7 + i + 1),
      project_id: e.pid, amount_paid: Math.round((e.budget * s.pct) / 100),
      paid_on: dateStr(dueOff + 2), method: methods[recIdx++ % methods.length],
      reference: `TARE/${e.key.toUpperCase().slice(0, 3)}/${String(i + 1).padStart(2, "0")}`,
      notes: `Received against ${s.name}`,
      recorded_by: U.manasa, created_at: tsStr(dueOff + 2),
    });
  });
}

// ----- DRAWING REGISTER table + rows (every enriched project) -----
let tblN = 0, colN = 0, rowN = 0;
const drawingSets = [
  ["A-001", "Site Plan", true, true, "R2", true],
  ["A-002", "Ground Floor Plan", true, true, "R3", true],
  ["A-003", "First Floor Plan", true, true, "R2", true],
  ["A-004", "Front Elevation", true, true, "R1", true],
  ["A-005", "Section A-A", true, false, "R1", false],
  ["S-001", "Foundation Layout", true, true, "R2", true],
  ["E-001", "Electrical Layout", true, false, "R0", false],
  ["P-001", "Plumbing Layout", false, false, "R0", false],
];
function makeTable(pid: string, name: string, ownerRole: string, presetId: string | null, order: number) {
  const tid = id("0009", ++tblN);
  ins("project_tables", { id: tid, tenant_id: TENANT, project_id: pid, name, table_owner_role: ownerRole, source_preset_id: presetId, display_order: order, created_by: U.owner, created_at: tsStr(-60) });
  return tid;
}
function drColumns(tid: string) {
  const defs: [string, string, boolean][] = [
    ["Sl No.", "serial", true], ["Drawing No.", "text", false], ["Description", "text", true],
    ["Drawn", "checkbox", false], ["Checked", "checkbox", false], ["Revision", "revision_text", false], ["Issued to Site", "checkbox", false],
  ];
  const ids = [DR_COL.sl, DR_COL.no, DR_COL.desc, DR_COL.drawn, DR_COL.checked, DR_COL.rev, DR_COL.issued];
  defs.forEach((d, i) => ins("project_table_columns", { id: id("0010", ++colN), tenant_id: TENANT, project_table_id: tid, name: d[0], column_kind: d[1], display_order: i + 1, is_required: d[2] }));
  return ids;
}
for (const e of enrich) {
  const tid = makeTable(e.pid, "Drawing Register", "team_member", DR_PRESET, 1);
  const cids = drColumns(tid);
  const howMany = isExec(e.key) ? 8 : 5;
  drawingSets.slice(0, howMany).forEach((d, i) => {
    const cells: Record<string, any> = {
      [cids[0]]: i + 1, [cids[1]]: d[0], [cids[2]]: d[1],
      [cids[3]]: d[2], [cids[4]]: d[3], [cids[5]]: d[4], [cids[6]]: d[5],
    };
    ins("project_table_rows", { id: id("0011", ++rowN), tenant_id: TENANT, project_table_id: tid, display_order: i + 1, cells: JSON.stringify(cells), created_by: leadByProj[e.key], created_at: tsStr(-55 + i) });
  });
  // Site Execution table for exec projects (site engineer owned)
  if (isExec(e.key)) {
    const stid = makeTable(e.pid, "Site Execution Checklist", "site_engineer", null, 2);
    const scols = [["Sl No.", "serial", true], ["Activity", "text", true], ["Status", "text", false], ["Done", "checkbox", false], ["Remarks", "text", false]];
    const scolIds = scols.map(() => id("0010", ++colN));
    scols.forEach((d, i) => ins("project_table_columns", { id: scolIds[i], tenant_id: TENANT, project_table_id: stid, name: d[0] as string, column_kind: d[1] as string, display_order: i + 1, is_required: d[2] as boolean }));
    const acts = [["Foundation & footing", "Complete", true, "PCC done, cured"], ["Plinth beam & backfill", "Complete", true, "OK"], ["Superstructure - GF columns", "Complete", true, ""], ["Slab casting - first floor", "In progress", false, "Shuttering up"], ["Block work & plastering", "Pending", false, ""], ["Electrical & plumbing rough-in", "Pending", false, ""]];
    acts.forEach((a, i) => {
      const cells: Record<string, any> = { [scolIds[0]]: i + 1, [scolIds[1]]: a[0], [scolIds[2]]: a[1], [scolIds[3]]: a[2], [scolIds[4]]: a[3] };
      ins("project_table_rows", { id: id("0011", ++rowN), tenant_id: TENANT, project_table_id: stid, display_order: i + 1, cells: JSON.stringify(cells), created_by: seByProj[e.key], created_at: tsStr(-30 + i) });
    });
  }
}

// ----- UPDATES (mix of note/progress/drawing/image across projects & authors) -----
let updN = 0;
function addUpdate(pid: string, author: string, role: string, type: string, body: string, off: number, hour = 12) {
  const uid = id("0012", ++updN);
  ins("updates", { id: uid, tenant_id: TENANT, project_id: pid, author_id: author, author_role_on_project: role, update_type: type, body, created_at: tsStr(off, hour) });
  return uid;
}
for (const e of enrich) {
  const lead = leadByProj[e.key], se = seByProj[e.key];
  addUpdate(e.pid, lead, "lead_architect", "progress", `Design development drawings finalised for ${e.key === "mgr" ? "the restaurant" : "the residence"}. Awaiting client sign-off.`, -14, 10);
  addUpdate(e.pid, lead, "lead_architect", "drawing", "Uploaded revised elevations (R2) to the drawing register.", -11, 15);
  addUpdate(e.pid, supportByProj[e.key], "design_support", "note", "Incorporated client feedback on the kitchen layout.", -8, 11);
  if (isExec(e.key)) {
    addUpdate(e.pid, se, "site_engineer", "progress", "Slab casting for the first floor scheduled this week. Reinforcement check done.", -5, 9);
    const imgU = addUpdate(e.pid, se, "site_engineer", "image", "Site photos — column shuttering and rebar in place.", -3, 16);
    // media asset attached to the site image update
    ins("media_assets", { id: id("0013", updN), tenant_id: TENANT, project_id: e.pid, storage_path: `demo/${e.key}/site-${updN}.jpg`, bucket: "media-private", kind: "site_image", uploaded_by: se, taken_at: tsStr(-3, 16), linked_update_id: imgU, scan_status: "clean", visible_to_customer: false, drive_sync_status: "skipped", created_at: tsStr(-3, 16) });
    addUpdate(e.pid, se, "site_engineer", "note", "Material delivery (cement, 50 bags) received and stacked on site.", -2, 10);
  }
}

// ----- MATERIAL PLAN + CONSUMPTION (exec projects) -----
const matCols = "id, tenant_id, project_id, material_name, unit, planned_quantity, planned_for_week, created_by, created_at";
let matN = 0;
const mcCols = `id, tenant_id, project_id, material_plan_id, material_name, unit, quantity, logged_by, consumed_on, is_excess, created_at`;
// check material_consumption schema dynamically at apply time; build conservative inserts
const materials = [
  { name: "Cement (OPC 53)", unit: "bags", plan: 400 },
  { name: "Steel (Fe500)", unit: "kg", plan: 6000 },
  { name: "M-Sand", unit: "cu.ft", plan: 1800 },
  { name: "Bricks", unit: "nos", plan: 12000 },
];
let mcN = 0;
const matConsumptionRows: { mpid: string; pid: string; name: string; unit: string; qty: number; excess: boolean; se: string; off: number }[] = [];
for (const e of enrich) {
  if (!isExec(e.key)) continue;
  const se = seByProj[e.key];
  materials.forEach((m, i) => {
    const mpid = id("0014", ++matN);
    ins("material_plan", { id: mpid, tenant_id: TENANT, project_id: e.pid, material_name: m.name, unit: m.unit, planned_quantity: m.plan, planned_for_week: dateStr(-7), created_by: U.owner, created_at: tsStr(-35) });
    // consumption: one material on HARSHA trips the >15% excess flag
    const excess = e.key === "harsha" && i === 0;
    const qty = excess ? Math.round(m.plan * 1.25) : Math.round(m.plan * 0.6);
    matConsumptionRows.push({ mpid, pid: e.pid, name: m.name, unit: m.unit, qty, excess, se, off: -6 - i });
  });
}

// ----- EXPENSES (exec projects; pending + approved + one rejected) -----
let expN = 0;
const expenseDefs = [
  { cat: "materials", amt: 48000, desc: "Cement & steel purchase", status: "approved" },
  { cat: "labour", amt: 32000, desc: "Masonry labour - weekly", status: "approved" },
  { cat: "transport", amt: 6500, desc: "Material transport from depot", status: "pending" },
  { cat: "misc", amt: 4200, desc: "Site safety gear & consumables", status: "pending" },
  { cat: "labour", amt: 15000, desc: "Overtime claim - unverified", status: "rejected" },
];
for (const e of enrich) {
  if (!isExec(e.key)) continue;
  const se = seByProj[e.key];
  expenseDefs.forEach((x, i) => {
    const approved = x.status === "approved";
    const rejected = x.status === "rejected";
    ins("expenses", {
      id: id("0015", ++expN), tenant_id: TENANT, project_id: e.pid,
      amount: x.amt, category: x.cat, description: x.desc,
      spent_on: dateStr(-10 + i), recorded_by: se,
      approval_status: x.status,
      approved_by: approved || rejected ? U.owner : null,
      approved_at: approved || rejected ? tsStr(-8 + i) : null,
      rejection_reason: rejected ? "Insufficient documentation — resubmit with timesheet." : null,
      created_at: tsStr(-10 + i),
    });
  });
}

// ----- SITE CHECK-INS (exec projects; incl. per-site hours + one out-of-geofence) -----
const OFFICE = { lat: 12.971599, lng: 77.594566 };
let sciN = 0;
for (const e of enrich) {
  if (!isExec(e.key)) continue;
  const se = seByProj[e.key];
  // 3 closed sessions over the last week + 1 open today
  for (let d = 0; d < 3; d++) {
    const off = -2 - d * 2;
    const out = e.key === "niharika" && d === 1; // one out-of-geofence
    ins("site_check_ins", {
      id: id("0016", ++sciN), tenant_id: TENANT, user_id: se, project_id: e.pid,
      checked_in_at: tsStr(off, 9, 30),
      checked_out_at: tsStr(off, 17, 30), duration_minutes: 480,
      gps_lat: out ? 12.9120 : OFFICE.lat + 0.0008, gps_lng: out ? 77.4500 : OFFICE.lng + 0.0006,
      within_geofence: !out,
      geofence_failure_reason: out ? "Outside 200m office geofence (site location)" : null,
      notes: d === 0 ? "Full-day site supervision." : null,
      gps_retained_until: dateStr(30),
    });
  }
  // open session today (currently on site)
  ins("site_check_ins", {
    id: id("0016", ++sciN), tenant_id: TENANT, user_id: se, project_id: e.pid,
    checked_in_at: tsStr(0, 9, 15), checked_out_at: null, duration_minutes: null,
    gps_lat: OFFICE.lat + 0.0007, gps_lng: OFFICE.lng + 0.0005, within_geofence: true,
    gps_retained_until: dateStr(30),
  });
}

// ----- BRIDGE MESSAGES (per exec project; incl. a material_request) -----
let brN = 0;
for (const e of enrich) {
  if (!isExec(e.key)) continue;
  const se = seByProj[e.key], lead = leadByProj[e.key];
  ins("bridge_messages", { id: id("0017", ++brN), tenant_id: TENANT, project_id: e.pid, author_id: se, message_type: "text", body: "Slab casting needs the latest structural drawing — can you confirm rebar spacing?", created_at: tsStr(-4, 10) });
  ins("bridge_messages", { id: id("0017", ++brN), tenant_id: TENANT, project_id: e.pid, author_id: lead, message_type: "clarification", body: "Spacing confirmed: 150mm c/c both ways. Updated drawing S-001 R2 issued.", structured_payload: JSON.stringify({ question: "rebar spacing for first floor slab" }), created_at: tsStr(-4, 12) });
}

// ----- CALENDAR EVENTS -----
let calN = 0;
for (const e of enrich.filter((x) => isExec(x.key)).slice(0, 3)) {
  ins("calendar_events", { id: id("0018", ++calN), tenant_id: TENANT, project_id: e.pid, title: `Site review — ${e.key}`, description: "Weekly progress walkthrough with the site engineer.", starts_at: tsStr(2, 11), ends_at: tsStr(2, 12), visibility: "project", source_type: "manual", assigned_user_id: seByProj[e.key], created_by: U.owner, created_at: tsStr(-1) });
}
ins("calendar_events", { id: id("0018", ++calN), tenant_id: TENANT, title: "Studio monthly review", description: "All-hands project and finance review.", starts_at: tsStr(5, 16), ends_at: tsStr(5, 18), visibility: "tenant", source_type: "manual", created_by: U.owner, created_at: tsStr(-1) });

// ----- OWNER BROADCAST (+recipients) -----
const bId = id("0019", 1);
ins("owner_broadcasts", { id: bId, tenant_id: TENANT, author_id: U.owner, body: "Team — please ensure all drawing registers are up to date before Friday's monthly review. Site engineers, update your execution checklists.", created_at: tsStr(-1, 17) });
const recipients = [U.divya, U.anitha, U.sowmiya, U.noor, U.zahra, U.srinivas, U.manjunath, U.siddiq, U.adarsha, U.bhoomika];
recipients.forEach((u, i) => ins("owner_broadcast_recipients", { id: id("0020", i + 1), tenant_id: TENANT, broadcast_id: bId, user_id: u, is_acknowledged: i < 6, acknowledged_at: i < 6 ? tsStr(-1, 18 + (i % 4)) : null }));

// ----- MEMBER TASKS (persistent) -----
let mtN = 0;
const memberTasks: [string, string, boolean][] = [
  [U.divya, "Finalise Harsha first-floor working drawings", false],
  [U.divya, "Coordinate structural drawings with consultant", true],
  [U.anitha, "Revise Varun elevation per client feedback", false],
  [U.sowmiya, "Prepare MGR restaurant seating layout options", false],
  [U.noor, "Update Suresh BOQ", true],
  [U.zahra, "Issue Ranga finishing schedule", false],
  [U.bhoomika, "QA review of Sheela interior drawings", false],
];
memberTasks.forEach((t, i) => ins("member_tasks", { id: id("0021", ++mtN), tenant_id: TENANT, user_id: t[0], title: t[1], completed: t[2], completed_at: t[2] ? tsStr(-2) : null, created_at: tsStr(-7 + i) }));

// ----- TEAM DAILY TASKS -----
let dtN = 0;
const dailyTasks: [string, string, string, boolean][] = [
  [U.divya, P.harsha, "Detailed first-floor plan", true],
  [U.anitha, P.varun, "Elevation revision R2", true],
  [U.sowmiya, P.mgr, "Restaurant layout draft", false],
  [U.srinivas, P.harsha, "Supervise slab reinforcement", true],
  [U.manjunath, P.varun, "Plastering quality check", false],
];
dailyTasks.forEach((t, i) => ins("team_daily_tasks", { id: id("0022", ++dtN), tenant_id: TENANT, user_id: t[0], project_id: t[1], task_date: dateStr(0), description: t[2], is_done: t[3], done_at: t[3] ? tsStr(0, 14) : null, created_at: tsStr(0, 9) }));

// ----- PERSONAL REMINDERS -----
let prmN = 0;
const personal: [string, string, number, number, string][] = [
  [U.divya, "Submit timesheet", 0, 18, "deadline"],
  [U.srinivas, "Order safety helmets for site", 1, 9, "other"],
  [U.owner, "Review monthly finances", 2, 10, "meeting"],
  [U.anitha, "Client call - Varun", 1, 15, "meeting"],
];
personal.forEach((p, i) => ins("personal_reminders", { id: id("0023", ++prmN), tenant_id: TENANT, user_id: p[0], title: p[1], reminder_at: tsStr(p[2], p[3]), type: p[4], created_at: tsStr(-1) }));

// ----- ATTENDANCE (last 5 working days for a representative set) -----
let attN = 0;
// broad team-member attendance (owner team page) + active site engineers
const attUsers = [
  U.divya, U.anitha, U.sowmiya, U.noor, U.bhoomika, U.manasa,
  U.nidhi, U.usha, U.zahra, U.shanthi, U.mirza,
  U.srinivas, U.manjunath, U.siddiq, U.adarsha,
];
for (const u of attUsers) {
  for (let d = 0; d < 5; d++) {
    const off = -d - (d >= 3 ? 2 : 0); // skip weekend-ish
    const mins = 480 + (d % 2) * 30;
    ins("attendance_logs", {
      id: id("0024", ++attN), tenant_id: TENANT, user_id: u, work_date: dateStr(off),
      check_in_at: tsStr(off, 9, 35), check_in_lat: OFFICE.lat, check_in_lng: OFFICE.lng, check_in_within_geofence: true,
      check_out_at: tsStr(off, 18, 5), check_out_lat: OFFICE.lat, check_out_lng: OFFICE.lng, check_out_within_geofence: true,
      check_in_count: 1, accumulated_minutes: mins,
      created_at: tsStr(off, 9, 35),
    });
  }
}

// ----- TEAM PERFORMANCE (2 months, representative members) -----
let perfN = 0;
const perfUsers = [
  { u: U.divya, dr: 18, er: 1, rv: 3, dm: 95, cr: 9 },
  { u: U.anitha, dr: 15, er: 2, rv: 4, dm: 90, cr: 8 },
  { u: U.sowmiya, dr: 12, er: 1, rv: 2, dm: 92, cr: 8.5 },
  { u: U.noor, dr: 14, er: 0, rv: 3, dm: 96, cr: 9 },
  { u: U.bhoomika, dr: 10, er: 3, rv: 5, dm: 85, cr: 7.5 },
];
for (const m of [-1, -2]) {
  for (const p of perfUsers) {
    ins("team_performance_monthly", {
      id: id("0025", ++perfN), tenant_id: TENANT, user_id: p.u, period_month: monthStart(m),
      drawings_completed: p.dr - (m === -2 ? 2 : 0), errors: p.er, revisions: p.rv,
      deadline_met_pct: p.dm, client_rating: p.cr, site_delay_days: 0,
      recorded_by: U.owner, created_at: tsStr(-1),
    });
  }
}

lines.push("COMMIT;");

const sql = lines.join("\n") + "\n";

// material_consumption inserts need the real schema — emit them separately after we confirm columns.
export const seedSQL = sql;
export const matConsumption = matConsumptionRows;

if (process.argv.includes("--sql")) {
  // NEVER write into supabase/migrations/ — the migrate runner applies every *.sql there.
  writeFileSync("supabase/demo_seed_v2.generated.sql", sql);
  process.exit(0);
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // discover material_consumption columns
  const mc = await c.query(
    "select column_name from information_schema.columns where table_name='material_consumption' and table_schema='public' order by ordinal_position"
  );
  const mcColNames = mc.rows.map((r: any) => r.column_name);

  // run main seed
  await c.query(sql);

  // material_consumption (built against real columns)
  await c.query("BEGIN");
  await c.query("SET LOCAL session_replication_role = replica");
  await c.query("DELETE FROM material_consumption WHERE id::text LIKE 'dec0de00-%'");
  for (let i = 0; i < matConsumptionRows.length; i++) {
    const m = matConsumptionRows[i];
    const row: Record<string, any> = {
      id: id("0026", i + 1), tenant_id: TENANT, project_id: m.pid,
      material_plan_id: m.mpid, material_name: m.name, unit: m.unit,
      quantity_used: m.qty, is_excess: m.excess,
      excess_reason: m.excess ? "Additional consumption due to rework on foundation" : null,
      consumed_on: dateStr(m.off), recorded_by: m.se, is_corrected: false,
      created_at: tsStr(m.off),
    };
    const cols = Object.keys(row);
    await c.query(
      `INSERT INTO material_consumption (${cols.join(",")}) VALUES (${cols
        .map((_, k) => "$" + (k + 1))
        .join(",")})`,
      cols.map((k) => row[k])
    );
  }
  await c.query("COMMIT");

  console.log("Demo seed applied. material_consumption columns:", mcColNames.join(", "));
  await c.end();
})().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
