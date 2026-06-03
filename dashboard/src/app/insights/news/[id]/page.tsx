import { cookies } from "next/headers";

import { ListingsInsightsView } from "@/components/ListingsInsightsView";

export default async function NewsInsightsIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const isSSO = cookieStore.get("ufs_insights_sso")?.value === "1";

  return (
    <ListingsInsightsView
      draftId={Number(id)}
      backHref="/insights/listings"
      backLabel="Back to insights hub"
      defaultTab="news"
      newsOnly
      isSSO={isSSO}
    />
  );
}
