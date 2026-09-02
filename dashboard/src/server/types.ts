export type DraftStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type NewsletterStatus =
  | "draft"
  | "approved"
  | "sending"
  | "scheduled"
  | "sent"
  | "failed";

export type ApprovalAction = "approve" | "reject" | "request_changes" | "edit";

export interface DraftSection {
  section_type: string;
  title: string;
  teaser: string;
  body: string;
  audience_tag?: string;
  metadata?: Record<string, unknown>;
}

export type AudienceGroupKey = "registered" | "prospect";
export type GroupSendStatus = "pending" | "sent" | "failed" | null;

export interface NewsletterRecord {
  id: number;
  issue_number: number;
  issue_date: string;
  status: NewsletterStatus;
  mailchimp_campaign_id: string | null;
  registered_send_status: GroupSendStatus;
  registered_campaign_id: string | null;
  prospect_send_status: GroupSendStatus;
  prospect_campaign_id: string | null;
  sender_email: string | null;
  created_at: string;
  updated_at: string;
}

// Sentinel value for DraftRecord.raw_data when it was NOT loaded from the
// database. drafts.raw_data can run 500-700KB per row once the table has
// real pipeline history, and Prisma's query engine hangs (not just slows
// down) when findMany() pulls many of those at once. So the bulk
// readDatabase()/withDatabase() path never loads raw_data by default - it
// carries this sentinel instead, and the handful of call sites that
// genuinely need it (AI draft generation, comparing against historical
// issues) hydrate specific drafts on demand via getDraftsRawData() in
// store.ts. persistDatabase() in store.ts checks this sentinel before ever
// writing raw_data back, so an un-hydrated draft can never have its real
// stored data overwritten by this placeholder.
export const RAW_DATA_NOT_LOADED: Record<string, unknown> = Object.freeze({ __unloaded: true });

export function isRawDataLoaded(rawData: Record<string, unknown>): boolean {
  return rawData !== RAW_DATA_NOT_LOADED && rawData.__unloaded !== true;
}

export interface DraftRecord {
  id: number;
  newsletter_id: number;
  raw_data: Record<string, unknown>;
  ai_draft: Record<string, unknown>;
  human_edits: { sections?: DraftSection[] } | null;
  status: DraftStatus;
  reviewer_email: string | null;
  reviewed_at: string | null;
  sources_used: string[] | null;
  sources_warning: string[] | null;
  sources_failed: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleRecord {
  id: number;
  newsletter_id: number;
  section_type: string;
  title: string;
  teaser: string;
  body: string;
  audience_tag: string;
  publish_date: string | null;
  ms_platform_url: string | null;
  created_at: string;
}

export interface ApprovalLogRecord {
  id: number;
  draft_id: number;
  action: ApprovalAction;
  reviewer: string;
  notes: string | null;
  timestamp: string;
}

export interface DatabaseRecord {
  newsletters: NewsletterRecord[];
  drafts: DraftRecord[];
  articles: ArticleRecord[];
  approval_logs: ApprovalLogRecord[];
}

export interface SourceResult {
  source: string;
  collected_at: string;
  data: Array<Record<string, unknown>>;
  errors: string[];
  success: boolean;
  optional?: boolean;
  no_signal_reason?: string;
}
