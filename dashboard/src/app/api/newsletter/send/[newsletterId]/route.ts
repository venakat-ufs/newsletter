import { NextRequest, NextResponse } from "next/server";

import { checkActionRateLimit } from "@/server/action-rate-limit";
import { mapRouteError, sendNewsletterToGroups } from "@/server/workflow";
import type { AudienceGroupKey } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAudienceGroupKey(value: unknown): value is AudienceGroupKey {
  return value === "registered" || value === "prospect";
}

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
    const limit = checkActionRateLimit(`send:${newsletterId}:${ip}`, 3, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { detail: "Too many send requests for this newsletter. Please wait." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
        },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { groups?: unknown; senderEmail?: unknown };
    const groups = Array.isArray(body.groups) ? body.groups.filter(isAudienceGroupKey) : [];
    const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail : "";

    if (groups.length === 0) {
      return NextResponse.json({ detail: "Select at least one audience group." }, { status: 400 });
    }
    if (!senderEmail) {
      return NextResponse.json({ detail: "Select a sender." }, { status: 400 });
    }

    return NextResponse.json(await sendNewsletterToGroups(parsed, groups, senderEmail));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
