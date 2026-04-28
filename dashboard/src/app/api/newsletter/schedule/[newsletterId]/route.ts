import { NextRequest, NextResponse } from "next/server";

import { checkActionRateLimit } from "@/server/action-rate-limit";
import { mapRouteError, scheduleNewsletterSend } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ newsletterId: string }> },
) {
  try {
    const { newsletterId } = await context.params;
    const parsed = Number.parseInt(newsletterId, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("Invalid newsletter id");
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = checkActionRateLimit(`schedule:${newsletterId}:${ip}`, 3, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { detail: "Too many schedule requests for this newsletter. Please wait." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
        },
      );
    }

    return NextResponse.json(await scheduleNewsletterSend(parsed));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
