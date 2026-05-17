#!/usr/bin/env node
// Migration runner — connects via DATABASE_URL, runs numbered migrations in order.
//
// Usage:
//   DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
//   npx tsx scripts/migrate.ts
//
// Get DATABASE_URL from: Supabase dashboard → Settings → Database → Connection String (URI)
// Use the "Session mode" (port 5432) connection string, NOT transaction mode.
import 'dotenv/config'
import { Client } from "pg";
import fs from "fs";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Get it from Supabase dashboard → Settings → Database.");
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
const SEED_DIR       = path.join(__dirname, "..", "supabase", "seed");
const runSeed        = process.argv.includes("--seed");

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Connected to Supabase Postgres\n");

  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set<string>(
    (await client.query<{ filename: string }>("SELECT filename FROM _migrations")).rows.map(r => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ⏭  ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`  ▶  Running ${file}…`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  ✅ ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ❌ ${file} FAILED:`, (err as Error).message);
      process.exit(1);
    }
  }

  if (runSeed) {
    console.log("\n── Seed ──");
    const seedFiles = fs.readdirSync(SEED_DIR).filter(f => f.endsWith(".sql")).sort();
    for (const file of seedFiles) {
      const sql = fs.readFileSync(path.join(SEED_DIR, file), "utf8");
      // Skip files that are all comments
      if (!sql.replace(/--[^\n]*/g, "").trim()) {
        console.log(`  ⏭  ${file} (stub — fill in data first)`);
        continue;
      }
      console.log(`  ▶  Seeding ${file}…`);
      await client.query(sql);
      console.log(`  ✅ ${file}`);
    }
  }

  await client.end();
  console.log("\n🚀 All migrations applied.");
}

run().catch(err => { console.error(err); process.exit(1); });
