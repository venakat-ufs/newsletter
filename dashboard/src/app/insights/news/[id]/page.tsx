import { cookies } from "next/headers";

import { ListingsInsightsView } from "@/components/ListingsInsightsView";
import { fetchDraftForInsights } from "@/server/draft-insights";

export default async function NewsInsightsIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [cookieStore, initialDraft] = await Promise.all([
    cookies(),
    fetchDraftForInsights(Number(id)),
  ]);
  const isSSO = cookieStore.get("ufs_insights_sso")?.value === "1";

  return (
    <ListingsInsightsView
      draftId={Number(id)}
      backHref="/insights/listings"
      backLabel="Back to insights hub"
      defaultTab="news"
      newsOnly
      isSSO={isSSO}
      initialDraft={initialDraft ?? undefined}
    />
  );
}
