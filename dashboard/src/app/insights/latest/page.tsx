import { cookies } from "next/headers";

import { ListingsInsightsView } from "@/components/ListingsInsightsView";
import { fetchLatestDraftForInsights } from "@/server/draft-insights";

export const dynamic = "force-dynamic";

export default async function LatestInsightsPage() {
  const [cookieStore, latestDraft] = await Promise.all([
    cookies(),
    fetchLatestDraftForInsights(),
  ]);
  const isSSO = cookieStore.get("ufs_insights_sso")?.value === "1";

  if (!latestDraft) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Insights Hub</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#111827]">No issues yet</h1>
          <p className="mt-2 text-sm leading-6 text-[#6B7280]">
            Run the pipeline first to create newsletter issues.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ListingsInsightsView
      draftId={latestDraft.id}
      backHref="/insights/listings"
      backLabel="Back to insights hub"
      isSSO={isSSO}
      initialDraft={latestDraft}
    />
  );
}
