import { NextResponse } from "next/server";

import { prisma } from "@/server/prisma";
import { ensureDatabaseReady } from "@/server/prisma";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    // Run initialization + DB ping to keep the serverless function and
    // Prisma connection pool warm between requests.
    await ensureDatabaseReady();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "warm", ts: Date.now() });
  } catch {
    return NextResponse.json({ status: "warm", db: "unavailable", ts: Date.now() });
  }
}
