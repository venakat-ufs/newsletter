// One-time data migration: copy all rows from the OLD Supabase project to a NEW one.
//
// The OLD database is only ever READ from — never modified. Safe to re-run
// (uses skipDuplicates, so existing rows in NEW are left untouched).
//
// Usage (PowerShell):
//   $env:OLD_DATABASE_URL="postgresql://...ap-southeast-1...:5432/postgres"
//   $env:NEW_DATABASE_URL="postgresql://...us-east-1...:5432/postgres"
//   node scripts/migrate-db.mjs
//
// Use the DIRECT connection strings (port 5432), not the pooler (6543).

import { PrismaClient } from "@prisma/client";

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;

if (!OLD_URL || !NEW_URL) {
  console.error("ERROR: set both OLD_DATABASE_URL and NEW_DATABASE_URL env vars.");
  process.exit(1);
}

const oldDb = new PrismaClient({ datasourceUrl: OLD_URL });
const newDb = new PrismaClient({ datasourceUrl: NEW_URL });

// Order matters only if you have FK constraints; this schema has none, but we
// keep a sensible order anyway.
const MODELS = [
  "newsletter",
  "draft",
  "article",
  "approvalLog",
  "workflowLog",
  "pipelineJob",
  "loginAttempt",
];

async function main() {
  console.log("=== Reading from OLD, writing to NEW (old is read-only) ===\n");

  for (const model of MODELS) {
    const rows = await oldDb[model].findMany();
    if (rows.length === 0) {
      console.log(`${model}: 0 rows in OLD — skipping`);
      continue;
    }
    const result = await newDb[model].createMany({
      data: rows,
      skipDuplicates: true,
    });
    console.log(`${model}: copied ${result.count} of ${rows.length} rows`);
  }

  console.log("\n=== Verification (row counts must match) ===\n");
  let allMatch = true;
  for (const model of MODELS) {
    const [oldCount, newCount] = await Promise.all([
      oldDb[model].count(),
      newDb[model].count(),
    ]);
    const ok = oldCount === newCount;
    if (!ok) allMatch = false;
    console.log(`${model}: OLD=${oldCount}  NEW=${newCount}  ${ok ? "OK" : "MISMATCH"}`);
  }

  console.log(allMatch ? "\nAll tables match. Migration complete." : "\nSome tables differ — review above.");
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await oldDb.$disconnect();
    await newDb.$disconnect();
  });
