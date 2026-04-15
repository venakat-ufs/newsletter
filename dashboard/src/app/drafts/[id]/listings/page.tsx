import { redirect } from "next/navigation";

export default async function LegacyDraftListingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/insights/listings/${id}`);
}
