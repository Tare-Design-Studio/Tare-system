#!/usr/bin/env node
// Transaction-pooler confirmation + concurrent-connection probe.
//
// The app runtime talks to Supabase over HTTP/PostgREST (no raw pg pool), so
// pooler sizing only matters for: (a) the migration runner, (b) any direct pg
// client, and (c) confirming the project's pooler can absorb the connection
// fan-out of a third tenant. This script verifies the pooler is in
// TRANSACTION mode (port 6543) and that N concurrent short transactions all
// succeed without exhausting connections.
//
// Usage:
//   POOLER_URL="postgresql://postgres.xxx:PASS@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
//   CONCURRENCY=50 \
//   npx tsx scripts/pooler-check.ts
//
// Get the URI from: Supabase dashboard → Settings → Database → Connection
// String → "Transaction" mode (port 6543).
import "dotenv/config";
import { Client } from "pg";

const POOLER_URL = process.env.POOLER_URL ?? process.env.DATABASE_URL;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "50");
const ITERATIONS = Number(process.env.ITERATIONS ?? "5");

if (!POOLER_URL) {
  console.error("❌ POOLER_URL (or DATABASE_URL) is not set.");
  process.exit(1);
}

const usesTransactionPort = /:6543\//.test(POOLER_URL);

async function oneTxn(id: number): Promise<number> {
  // A fresh client per call mimics the pooler's per-transaction connection
  // churn. In transaction mode the pooler multiplexes these onto a small
  // backend pool; this should succeed far past the raw Postgres conn limit.
  const client = new Client({ connectionString: POOLER_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
    return rows[0].pid as number;
  } finally {
    await client.end();
  }
}

async function run() {
  console.log(`Pooler check → ${POOLER_URL!.replace(/:[^:@/]+@/, ":****@")}`);
  console.log(`Mode hint: ${usesTransactionPort ? "TRANSACTION (port 6543) ✅" : "⚠️  NOT port 6543 — likely session mode (5432)"}`);
  console.log(`Concurrency: ${CONCURRENCY} × ${ITERATIONS} iterations\n`);

  let ok = 0;
  let failed = 0;
  const pids = new Set<number>();
  const latencies: number[] = [];

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const batch = Array.from({ length: CONCURRENCY }, async (_, i) => {
      const start = Date.now();
      try {
        const pid = await oneTxn(iter * CONCURRENCY + i);
        pids.add(pid);
        ok++;
      } catch (e) {
        failed++;
        if (failed <= 3) console.error("  txn failed:", (e as Error).message);
      } finally {
        latencies.push(Date.now() - start);
      }
    });
    await Promise.all(batch);
    process.stdout.write(`  iteration ${iter + 1}/${ITERATIONS} done\n`);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const max = latencies[latencies.length - 1];

  console.log("\n── Result ──");
  console.log(`succeeded:        ${ok}`);
  console.log(`failed:           ${failed}`);
  console.log(`distinct backends: ${pids.size} (low number ⇒ pooler is reusing backends, i.e. multiplexing)`);
  console.log(`latency ms p50/p95/max: ${p50}/${p95}/${max}`);

  if (failed > 0) {
    console.error("\n❌ Some transactions failed — pooler likely connection-starved at this concurrency.");
    process.exit(1);
  }
  if (!usesTransactionPort) {
    console.warn("\n⚠️  Passed, but you tested a non-6543 URL. Re-run against the transaction-mode (6543) URI to confirm runtime behavior.");
  }
  console.log("\n✅ All transactions succeeded.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
