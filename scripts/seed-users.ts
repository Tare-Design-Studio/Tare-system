#!/usr/bin/env node
// One-off: create the 19 Tare employees as real auth + app users.
// Mirrors app/api/invite/route.ts: auth.admin.createUser -> public.users -> capabilities -> tags.
// Idempotent-ish: skips an email that already has an auth user.
//
//   SHARED_TEMP_PASSWORD="..." npx tsx scripts/seed-users.ts            # dry run (prints plan)
//   SHARED_TEMP_PASSWORD="..." npx tsx scripts/seed-users.ts --commit   # actually create
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  OWNER_CAPABILITIES,
  TEAM_MEMBER_CAPABILITIES,
  SITE_ENGINEER_CAPABILITIES,
} from "../lib/auth/capabilities";

type Role = "owner" | "team_member" | "site_engineer";
type Tag = "accountant" | "admin" | "project_manager";

interface Emp {
  full_name: string;
  email: string;        // synthesized placeholder if missing in sheet
  role: Role;
  tag?: Tag;
  phone?: string;
  role_label: string;   // human job title from the sheet
  experience_years?: number;
  is_active: boolean;
  email_placeholder?: boolean;
}

const TENANT_ID = "d4784db6-9a2d-4075-97b5-14daaa9026ab";
const PASSWORD = process.env.SHARED_TEMP_PASSWORD;
const COMMIT = process.argv.includes("--commit");

const EMPLOYEES: Emp[] = [
  { full_name: "Nayan Kumar H.T.", email: "nayangwd3@gmail.com", role: "owner", role_label: "Founder Director", phone: "9620329233", experience_years: 9.5, is_active: true },

  // Site engineers (on-site)
  { full_name: "Srinivas Prasad", email: "srinivasprasad020@gmail.com", role: "site_engineer", role_label: "Site Engineer", phone: "8548009686", experience_years: 3.1, is_active: true },
  { full_name: "Manjunath S", email: "manjunath.s@tare.local", role: "site_engineer", role_label: "Site Engineer", phone: "7406762303", experience_years: 14, is_active: true, email_placeholder: true },
  { full_name: "Mohammed Sidddiq", email: "siddiq1109@gmail.com", role: "site_engineer", role_label: "Senior Site Engineer", phone: "9743753142", experience_years: 14.7, is_active: true },
  { full_name: "Adarsha Pejawar", email: "adarshpejawar0007@gmail.com", role: "site_engineer", tag: "project_manager", role_label: "Construction Project Manager", phone: "9611389038", experience_years: 11, is_active: true },

  // Team members
  { full_name: "Anitha", email: "anukushi365@gmail.com", role: "team_member", role_label: "Draughtsperson", phone: "8088186690", experience_years: 3.5, is_active: true },
  { full_name: "Ar. Divya J.", email: "divyajayarama98@gmail.com", role: "team_member", role_label: "Architect", phone: "9686238912", experience_years: 4.2, is_active: true },
  { full_name: "Ar. Mohammed Firasath Mehdi", email: "firasath31mehdi2002@gmail.com", role: "team_member", role_label: "Junior Architect", phone: "8660247119", experience_years: 0.3, is_active: true },
  { full_name: "Ar. Mirza Muizz Haseeb", email: "muizzhaseeb.msa20@gmail.com", role: "team_member", role_label: "Junior Architect", phone: "8105862786", experience_years: 0, is_active: true },
  { full_name: "Ar. Noor Arshiya", email: "arshiya92002@gmail.com", role: "team_member", role_label: "Junior Architect", phone: "8073110150", experience_years: 0.1, is_active: true },
  { full_name: "Ar. Sneha K.M", email: "ar.snehakm26@gmail.com", role: "team_member", role_label: "Architect", phone: "8861041210", experience_years: 5.6, is_active: true },
  { full_name: "Usha S", email: "s.usha1068@gmail.com", role: "team_member", role_label: "Senior Architectural Designer", phone: "9480135597", experience_years: 24.7, is_active: true },
  { full_name: "Dr. Ar. Zahra Bathool", email: "architectzahrabathool@gmail.com", role: "team_member", role_label: "Senior Architect and Urban Planner", phone: "9739687423", experience_years: 16.5, is_active: true },
  { full_name: "Bhoomika S Gowda", email: "bhoomikasgowda762@gmail.com", role: "team_member", role_label: "Draughtsperson", phone: "9880286909", experience_years: 1.2, is_active: true },
  { full_name: "Ravindranath P", email: "ravipswamy20@gmail.com", role: "team_member", role_label: "Quantity Surveyor and Project Co-ordinator", phone: "8217676155", experience_years: 5.2, is_active: false },
  { full_name: "Nidhi S M", email: "nidhigowda498@gmail.com", role: "team_member", role_label: "Assistant Structural Engineer", phone: "8317313204", experience_years: 3.2, is_active: true },
  { full_name: "Shanthi P", email: "shanthikushi2315@gmail.com", role: "team_member", role_label: "Assistant Design Engineer", phone: "8147658701", experience_years: 5.2, is_active: true },
  { full_name: "G.Sowmiya Rao", email: "sowmya.g.rao26@gmail.com", role: "team_member", role_label: "Interior Designer", phone: "8838074812", experience_years: 4, is_active: true },
  { full_name: "Manasa Suresh", email: "manasaarna04@gmail.com", role: "team_member", tag: "accountant", role_label: "Operations Manager (HR and Fin)", phone: "8951708710", experience_years: 4.8, is_active: true },
  { full_name: "Keerthi Kumar", email: "keerthi.kumar@tare.local", role: "team_member", role_label: "Driver", phone: "9071487392", experience_years: 3, is_active: true, email_placeholder: true },
];

function capsFor(role: Role): string[] {
  if (role === "owner") return OWNER_CAPABILITIES as string[];
  if (role === "site_engineer") return SITE_ENGINEER_CAPABILITIES as string[];
  return TEAM_MEMBER_CAPABILITIES as string[];
}

async function main() {
  if (!PASSWORD) { console.error("❌ Set SHARED_TEMP_PASSWORD env var."); process.exit(1); }
  if (PASSWORD.length < 8) { console.error("❌ SHARED_TEMP_PASSWORD must be >= 8 chars."); process.exit(1); }

  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Mode: ${COMMIT ? "COMMIT (creating accounts)" : "DRY RUN (no writes)"}\n`);
  console.log(`${"Role".padEnd(14)} ${"Tag".padEnd(16)} Name / email`);
  for (const e of EMPLOYEES) {
    const flags = [e.is_active ? "" : "INACTIVE", e.email_placeholder ? "PLACEHOLDER-EMAIL" : ""].filter(Boolean).join(" ");
    console.log(`${e.role.padEnd(14)} ${(e.tag ?? "-").padEnd(16)} ${e.full_name} <${e.email}> ${flags}`);
  }
  console.log(`\nTotal: ${EMPLOYEES.length}`);
  if (!COMMIT) { console.log("\nDry run only. Re-run with --commit to create."); return; }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let created = 0, skipped = 0, failed = 0;
  for (const e of EMPLOYEES) {
    const { data: cu, error: ce } = await admin.auth.admin.createUser({
      email: e.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: e.full_name, role: e.role },
    });
    if (ce) {
      if (/already.*registered|already.*exists/i.test(ce.message)) { console.log(`  ⏭  ${e.full_name} (auth user exists)`); skipped++; continue; }
      console.error(`  ❌ ${e.full_name}: ${ce.message}`); failed++; continue;
    }
    const id = cu.user.id;

    const { error: ue } = await admin.from("users").upsert({
      id, tenant_id: TENANT_ID, full_name: e.full_name, role: e.role,
      role_label: e.role_label, phone: e.phone ?? null,
      experience_years: e.experience_years != null ? Math.round(e.experience_years) : null,
      is_active: e.is_active,
    }, { onConflict: "id" });
    if (ue) { console.error(`  ❌ ${e.full_name} users row: ${ue.message}`); failed++; continue; }

    const capRows = capsFor(e.role).map(c => ({ user_id: id, tenant_id: TENANT_ID, capability: c, granted: true, source: "manual" }));
    const { error: cape } = await admin.from("user_capabilities").upsert(capRows, { onConflict: "user_id, capability, scope_project_id" });
    if (cape) console.error(`  ⚠ ${e.full_name} caps: ${cape.message}`);

    if (e.tag) {
      // team_member_tags INSERT triggers (065) sync source='tag' capability rows automatically.
      const { error: te } = await admin.from("team_member_tags").insert({ tenant_id: TENANT_ID, user_id: id, tag: e.tag, granted_by: id });
      if (te) console.error(`  ⚠ ${e.full_name} tag ${e.tag}: ${te.message}`);
    }

    console.log(`  ✅ ${e.full_name} (${e.role}${e.tag ? "+" + e.tag : ""})`);
    created++;
  }
  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
