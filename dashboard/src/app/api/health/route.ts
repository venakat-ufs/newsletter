import { NextResponse } from "next/server";

import { prisma } from "@/server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lightweight ping — no full table scans
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "ufs-newsletter" });
  } catch {
    return NextResponse.json(
      { status: "degraded", service: "ufs-newsletter" },
      { status: 200 },
    );
  }
}
