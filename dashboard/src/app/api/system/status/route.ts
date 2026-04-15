import { NextResponse } from "next/server";

import { getSystemStatus } from "@/server/system-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSystemStatus());
}
