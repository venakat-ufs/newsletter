import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@/server/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const latest = await prisma.draft.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  if (!latest) {
    return NextResponse.redirect(`${origin}/insights/listings`);
  }

  return NextResponse.redirect(`${origin}/insights/listings/${latest.id}`);
}
