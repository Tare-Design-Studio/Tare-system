#!/usr/bin/env node
// One-off: load Tare projects from PROJECTS.xlsx (already parsed below).
// Sheet 1 (TOTAL PROJECTS): 40 projects, status=active, default scope (design stage).
// Sheet 2 (CONSTRUCTION UNDER MEDHYA): same projects as Sheet 1 -> upgrade those rows to
//   current_stage=execution (scope design_and_execution is the table default).
// Sheet 3 (PIPELINE): 5 projects, status=active.
// Loads name/slug/scope/stage/status only; all other fields left null.
//
//   npx tsx scripts/seed-projects.ts            # dry run
//   npx tsx scripts/seed-projects.ts --commit   # insert
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const TENANT_ID = "d4784db6-9a2d-4075-97b5-14daaa9026ab";
const COMMIT = process.argv.includes("--commit");

// Sheet 1 — TOTAL PROJECTS (SL 1..40), names trimmed.
const SHEET1 = [
  "SANDEEP", "SATISH", "GURURAJ", "ROOPANJALI", "MALA MANDANNA",
  "LAKSHMAN- VIJAYANAGAR", "LAKSHMAN-DATTAGALLI", "SANTHOSH", "AJAY", "VARUN",
  "NIHARIKA", "NAGESH", "PRAKASH", "LOKESH", "REHMAN",
  "SHIVAKUMAR", "MONISHA", "RANGA SRINIVAS", "VIJAY AGARWAL", "HARSHA",
  "LOKANNA PATIL", "SHEELA", "SURESH", "SATHYANARAYAN", "VINOD COMMERCIAL-DARWAD",
  "VINOD BAGALKOT", "KEMPARAJU", "M.G.R RESTAURANT", "SANDEEP LAYOUT- TADAHALLI",
  "DARWAD CORPORATION-RECORD ROOM", "DARWAD-PARK DEVELOPMENT", "DARWAD-GERMAN CIRCLE DEVELOPMENT",
  "SHILPA MANU", "SUNIL-CONVENTION", "RANJITH", "GIRISH", "SACHIN", "MOHAN",
  "PADMINI BHASKAR", "UMA BHASAVESH",
];

// Sheet 2 — Medhya (design + execution). Mapped to Sheet 1 names (SUNIL -> SUNIL-CONVENTION).
const MEDHYA = ["VARUN", "NIHARIKA", "MONISHA", "SUNIL-CONVENTION", "HARSHA", "SURESH", "RANGA SRINIVAS"];

// Sheet 3 — Pipeline.
const PIPELINE = ["RAMESH KABINI FARM", "MANUGANAHALLI FARM", "ROSHAN THIMMAIAH", "VIJAY RAMEGOWDA", "SUDHA SING"];

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Proj { name: string; slug: string; scope: string; current_stage: string; status: string; }

function build(): Proj[] {
  const medhya = new Set(MEDHYA);
  const rows: Proj[] = [];
  const seen = new Map<string, number>();
  const add = (name: string, isMedhya: boolean) => {
    const clean = name.trim();
    let slug = slugify(clean);
    const n = (seen.get(slug) ?? 0) + 1; seen.set(slug, n);
    if (n > 1) slug = `${slug}-${n}`;
    rows.push({
      name: clean,
      slug,
      scope: "design_and_execution",          // table default; explicit for clarity
      current_stage: isMedhya ? "execution" : "design",
      status: "active",
    });
  };
  for (const n of SHEET1) add(n, medhya.has(n.trim()));
  for (const n of PIPELINE) add(n, false);
  return rows;
}

async function main() {
  const projects = build();
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"}  |  tenant ${TENANT_ID}\n`);
  console.log(`${"stage".padEnd(10)} ${"slug".padEnd(34)} name`);
  for (const p of projects) {
    const tag = p.current_stage === "execution" ? " [MEDHYA exec]" : "";
    console.log(`${p.current_stage.padEnd(10)} ${p.slug.padEnd(34)} ${p.name}${tag}`);
  }
  console.log(`\nTotal: ${projects.length} (Sheet1=${SHEET1.length}, Pipeline=${PIPELINE.length}, Medhya-exec=${MEDHYA.length})`);

  if (!COMMIT) { console.log("\nDry run only. Re-run with --commit."); return; }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const payload = projects.map(p => ({ tenant_id: TENANT_ID, ...p }));
  const { data, error } = await admin.from("projects").insert(payload).select("id");
  if (error) { console.error("❌ insert failed:", error.message); process.exit(1); }
  console.log(`\n✅ Inserted ${data!.length} projects.`);
}

main().catch(e => { console.error(e); process.exit(1); });
