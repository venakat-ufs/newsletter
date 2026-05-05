import { DashboardClient } from "@/components/DashboardClient";
import { getSystemStatus } from "@/server/system-status";
import { listDrafts } from "@/server/workflow";
import type { Draft, IntegrationStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const [drafts, statusData] = await Promise.all([
    listDrafts().catch(() => []),
    getSystemStatus().catch(() => ({ integrations: [] })),
  ]);

  return (
    <DashboardClient
      initialDrafts={drafts as unknown as Draft[]}
      initialIntegrations={statusData.integrations as unknown as IntegrationStatus[]}
    />
  );
}
