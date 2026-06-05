import { DashboardClient } from "@/components/DashboardClient";
import { getSystemStatus } from "@/server/system-status";
import { getDraft, listDrafts } from "@/server/workflow";
import type { Draft, IntegrationStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const [drafts, statusData] = await Promise.all([
    listDrafts(undefined, 10).catch(() => []),
    getSystemStatus().catch(() => ({ integrations: [] })),
  ]);

  // The list is lean (no raw_data) for speed, but the dashboard's source map
  // and SOURCES count need the latest issue's full raw_data — hydrate just that one.
  if (drafts[0]) {
    const latestFull = await getDraft(Number(drafts[0].id)).catch(() => null);
    if (latestFull) {
      drafts[0] = latestFull;
    }
  }

  return (
    <DashboardClient
      initialDrafts={drafts as unknown as Draft[]}
      initialIntegrations={statusData.integrations as unknown as IntegrationStatus[]}
    />
  );
}
