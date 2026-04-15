export type DraftStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type NewsletterStatus =
  | "draft"
  | "approved"
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

export interface NewsletterRecord {
  id: number;
  issue_number: number;
  issue_date: string;
  status: NewsletterStatus;
  mailchimp_campaign_id: string | null;
  created_at: string;
  updated_at: string;
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
