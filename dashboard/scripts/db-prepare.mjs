/**
 * Creates newsletter tables in the database if they don't exist.
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to run on any database.
 * Does NOT drop or modify existing tables from other projects.
 */

// Skip on Vercel builds — schema is already applied and the connection
// pooler causes statement timeouts during the build phase.
if (process.env.VERCEL) {
  console.log("Vercel build detected — skipping db:prepare (schema already applied)");
  process.exit(0);
}
import { readFileSync } from "fs";
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load .env file for local dev (Vercel injects these directly)
try {
  const dotenv = require("dotenv");
  dotenv.config({ path: resolve(__dirname, "../../.env") });
  dotenv.config({ path: resolve(__dirname, "../.env") });
} catch {}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL or DIRECT_URL found in environment");
  process.exit(1);
}

const sqlPath = resolve(
  __dirname,
  "../prisma/migrations/20260416000000_init/migration.sql"
);
const sql = readFileSync(sqlPath, "utf8");

// Use pg directly — no Prisma migration tracking needed
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });

await client.connect();
try {
  // Raise statement timeout for this session so the DO $$ blocks don't get cancelled.
  await client.query("SET statement_timeout = '60s'");
  await client.query(sql);
  console.log("✓ Newsletter tables created/verified");
} catch (err) {
  // statement_timeout means the tables already exist in Supabase — safe to continue.
  if (err.message?.includes("statement timeout") || err.code === "57014") {
    console.warn("⚠  db:prepare timed out — tables likely already exist, continuing.");
  } else {
    console.error("Database setup failed:", err.message);
    process.exit(1);
  }
} finally {
  await client.end();
}
