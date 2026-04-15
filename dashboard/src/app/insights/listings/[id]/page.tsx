"use client";

import { use } from "react";

import { ListingsInsightsView } from "@/components/ListingsInsightsView";

export default function ListingsInsightsIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ListingsInsightsView draftId={Number(id)} backHref="/insights/listings" backLabel="Back to insights hub" />;
}
