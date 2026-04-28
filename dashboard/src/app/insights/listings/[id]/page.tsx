import { Suspense } from "react";

import { ListingsInsightsView } from "@/components/ListingsInsightsView";

export default async function ListingsInsightsIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-12 text-center text-sm text-[#6B7280] shadow-sm">
          Loading issue intelligence...
        </div>
      }
    >
      <ListingsInsightsView
        draftId={Number(id)}
        backHref="/insights/listings"
        backLabel="Back to insights hub"
      />
    </Suspense>
  );
}
