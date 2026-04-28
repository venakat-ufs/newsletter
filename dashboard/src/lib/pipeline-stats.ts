const PIPELINE_URL = "https://ldfzfxhwxzxwirvfpbul.supabase.co";
const PIPELINE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkZnpmeGh3eHp4d2lydmZwYnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDkyNjIsImV4cCI6MjA3NjM4NTI2Mn0.iKfGuycMquANu3xa85T-BxhAfN9nLE0D9Sq6IZwaZrQ";

export type PipelineStateRow = {
  week_start: string;
  state: string;
  total_listings: number;
  with_agent: number;
  with_email: number;
  leads_inserted: number;
};

export type PipelineTotals = {
  total_listings: number;
  with_agent: number;
  with_email: number;
  leads_inserted: number;
};

export type PipelineStats = {
  week_start: string;
  rows: PipelineStateRow[];
  totals: PipelineTotals;
};

export async function getPipelineStats(
  weekStart?: string,
  signal?: AbortSignal,
): Promise<PipelineStats | null> {
  try {
    const params = new URLSearchParams({
      select: "week_start,state,total_listings,with_agent,with_email,leads_inserted",
      order: "week_start.desc,total_listings.desc",
      total_listings: "gt.0",
      limit: "300",
    });

    if (weekStart) {
      params.set("week_start", `eq.${weekStart}`);
    }

    const resp = await fetch(`${PIPELINE_URL}/rest/v1/state_stats_weekly?${params}`, {
      headers: { apikey: PIPELINE_ANON_KEY },
      cache: "no-store",
      signal,
    });
    if (!resp.ok) return null;

    const raw: unknown = await resp.json();
    if (!Array.isArray(raw) || !raw.length) return null;

    const allRows = raw as PipelineStateRow[];

    // Keep only the latest week's rows when no specific week was requested
    const latestWeek = allRows[0].week_start;
    const rows = weekStart ? allRows : allRows.filter((r) => r.week_start === latestWeek);

    const totals = rows.reduce<PipelineTotals>(
      (acc, row) => ({
        total_listings: acc.total_listings + (row.total_listings || 0),
        with_agent: acc.with_agent + (row.with_agent || 0),
        with_email: acc.with_email + (row.with_email || 0),
        leads_inserted: acc.leads_inserted + (row.leads_inserted || 0),
      }),
      { total_listings: 0, with_agent: 0, with_email: 0, leads_inserted: 0 },
    );

    return { week_start: latestWeek, rows, totals };
  } catch {
    return null;
  }
}
