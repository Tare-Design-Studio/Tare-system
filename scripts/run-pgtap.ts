#!/usr/bin/env node
// Minimal pgtap runner (no pg_prove dependency).
// Executes each supabase/tests/*.sql via the pg client and parses TAP output.
// Each test file wraps itself in BEGIN…finish()…ROLLBACK, so the target DB is
// left clean.
//
// Why not pg_prove: 002_rls_coverage.sql builds a TEMP TABLE with ON COMMIT DROP
// and reads it from a later DO block. pg_prove sends each statement separately,
// so the temp table is already gone by the time the DO block runs and the file
// reports "planned N tests but ran 0" — a suite that asserts nothing looks like
// a pass. This runner sends each file as ONE multi-statement query, keeping the
// whole file in a single transaction, which is how these tests are written.
//
// Usage: DATABASE_URL=… npx tsx scripts/run-pgtap.ts
import 'dotenv/config'
import { Client } from "pg";
import fs from "fs";
import path from "path";

const TESTS_DIR = path.join(__dirname, "..", "supabase", "tests");

// Only numbered test files run. ci-bootstrap.sql and ci-seed-tenant.sql also
// live here but are environment setup applied by the workflow, not assertions.
const files = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

async function run() {
  // Supabase requires TLS; a local Postgres (the CI service container) serves
  // none and rejects the handshake, so honour an explicit sslmode=disable.
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    console.error("❌ DATABASE_URL is not set.");
    process.exit(1);
  }
  const client = new Client({
    connectionString: url,
    ssl: /[?&]sslmode=disable(&|$)/.test(url) ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  // 002 raises a WARNING naming any table that fails coverage; without this the
  // notice is discarded and the failure says only "1 FAILED of 165".
  client.on("notice", (n) => {
    if (n.message?.startsWith("RLS COVERAGE FAILURE")) console.log(`  ⚠️  ${n.message}`);
  });

  let allPass = true;
  let ran = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(TESTS_DIR, file), "utf8");
    process.stdout.write(`\n▶ ${file}\n`);
    try {
      const res = await client.query(sql);
      // A multi-statement query returns an array of result objects; pgtap emits
      // its TAP lines as rows from finish() and the test fns. Collect from all.
      const results = Array.isArray(res) ? res : [res];
      const tap = results
        .flatMap((r: unknown) => (r as { rows?: unknown[] })?.rows ?? [])
        .map((r: unknown) => Object.values(r as object)[0])
        .filter((v: unknown): v is string => typeof v === "string")
        .join("\n");
      // pgtap's finish() summarises failures as a "# Looks like you failed N
      // tests of M" comment line; individual ok/not-ok lines also appear. Treat
      // either a failure summary or any "not ok" as a failing run. The "1..N"
      // plan line tells us how many assertions ran.
      const planMatch = tap.match(/^1\.\.(\d+)/m);
      const planned = planMatch ? Number(planMatch[1]) : null;
      const failSummary = tap.match(/# Looks like you failed (\d+) test/);
      const notOk = (tap.match(/^not ok /gm) || []).length;
      const failed = failSummary ? Number(failSummary[1]) : notOk;
      if (failed > 0) {
        allPass = false;
        // Print only the failing assertions and their diagnostics, so the log
        // names the offending table instead of scrolling 165 passing lines.
        const lines = tap.split("\n");
        const detail = lines.filter(
          (l, i) =>
            /^not ok /.test(l) ||
            /^#/.test(l) ||
            (i > 0 && /^not ok /.test(lines[i - 1]))
        );
        console.log(detail.length ? detail.join("\n") : tap);
        console.log(`  ❌ ${file}: ${failed} FAILED of ${planned ?? "?"}`);
      } else {
        ran += planned ?? 0;
        console.log(`  ✅ ${file}: ${planned ?? "all"} assertions passed`);
      }
    } catch (e) {
      allPass = false;
      console.log(`  ❌ ${file} threw: ${(e as Error).message}`);
    }
  }

  await client.end();

  // A suite that connects but asserts nothing must not look like a pass.
  if (files.length === 0 || ran === 0) {
    console.log(`\n🔴 FAILURES — no assertions ran (${files.length} test files found).`);
    process.exit(1);
  }

  console.log(`\n${allPass ? "🟢 ALL PASS" : "🔴 FAILURES"}`);
  process.exit(allPass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
