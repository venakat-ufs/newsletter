import { NextRequest, NextResponse } from "next/server";

import { getNewsletterMailchimpStatus, mapRouteError } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ newsletterId: string }> },
) {
  try {
    const { newsletterId } = await context.params;
    const parsed = Number.parseInt(newsletterId, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("Invalid newsletter id");
    }

    return NextResponse.json(await getNewsletterMailchimpStatus(parsed));
  } catch (error) {
    const mapped = mapRouteError(error);
    return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
