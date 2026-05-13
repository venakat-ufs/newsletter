import { NextResponse } from "next/server";

import { prisma } from "@/server/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const latest = await prisma.draft.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!latest) {
    return NextResponse.redirect(new URL("/insights/listings", process.env.APP_PUBLIC_URL ?? "https://insights.unitedffs.com"));
  }

  return NextResponse.redirect(new URL(`/insights/listings/${latest.id}`, process.env.APP_PUBLIC_URL ?? "https://insights.unitedffs.com"));
}
