import { NextRequest } from "next/server";

import { getPublicArticleMarkup, mapRouteError } from "@/server/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ articleId: string }> },
) {
  try {
    const { articleId } = await context.params;
    const parsed = Number.parseInt(articleId, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("Invalid article id");
    }

    return new Response(await getPublicArticleMarkup(parsed), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    const mapped = mapRouteError(error);
    return Response.json({ detail: mapped.detail }, { status: mapped.status });
  }
}
