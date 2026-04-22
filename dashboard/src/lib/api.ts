const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export interface DraftSection {
  section_type: string;
  title: string;
  teaser: string;
  body: string;
  audience_tag?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceSnapshot {
  source?: string;
  collected_at?: string;
  data?: Array<Record<string, unknown>>;
  errors?: string[];
  success?: boolean;
}

export interface DraftRawData {
  sources?: Record<string, SourceSnapshot>;
  sections?: Record<
    string,
    {
      description?: string;
      data?: Array<Record<string, unknown>>;
    }
  >;
}

export interface Draft {
  id: number;
  newsletter_id: number;
  issue_number?: number;
  raw_data: DraftRawData;
  ai_draft: { sections?: DraftSection[]; errors?: string[]; generated_at?: string };
  human_edits: { sections?: DraftSection[] } | null;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  reviewer_email: string | null;
  reviewed_at: string | null;
  sources_used: string[] | null;
  sources_warning: string[] | null;
  sources_failed: string[] | null;
  created_at: string;
  updated_at: string;
}

function normalizeDraftStatus(value: unknown): Draft["status"] {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "changes_requested"
  ) {
    return value;
  }
  return "pending";
}

function normalizeDraftSection(value: unknown): DraftSection | null {
  const section = asRecord(value);
  const sectionType = asString(section.section_type, "unknown_section");
  if (!sectionType) {
    return null;
  }

  return {
    section_type: sectionType,
    title: asString(section.title),
    teaser: asString(section.teaser),
    body: asString(section.body),
    audience_tag: asString(section.audience_tag) || undefined,
    metadata:
      section.metadata && typeof section.metadata === "object" && !Array.isArray(section.metadata)
        ? (section.metadata as Record<string, unknown>)
        : undefined,
  };
}

function normalizeDraftSections(value: unknown): DraftSection[] {
  return asArray(value)
    .map((section) => normalizeDraftSection(section))
    .filter((section): section is DraftSection => Boolean(section));
}

function normalizeSourceSnapshot(value: unknown): SourceSnapshot {
  const source = asRecord(value);
  return {
    source: typeof source.source === "string" ? source.source : undefined,
    collected_at: typeof source.collected_at === "string" ? source.collected_at : undefined,
    data: asArray(source.data).map((item) => asRecord(item)),
    errors: asArray(source.errors).filter((item): item is string => typeof item === "string"),
    success: typeof source.success === "boolean" ? source.success : undefined,
  };
}

function normalizeDraftRawData(value: unknown): DraftRawData {
  const rawData = asRecord(value);
  const sourceRows = asRecord(rawData.sources);
  const sectionRows = asRecord(rawData.sections);

  const sources: Record<string, SourceSnapshot> = {};
  for (const [key, source] of Object.entries(sourceRows)) {
    sources[key] = normalizeSourceSnapshot(source);
  }

  const sections: NonNullable<DraftRawData["sections"]> = {};
  for (const [key, section] of Object.entries(sectionRows)) {
    const record = asRecord(section);
    sections[key] = {
      description: typeof record.description === "string" ? record.description : undefined,
      data: asArray(record.data).map((item) => asRecord(item)),
    };
  }

  return { sources, sections };
}

function normalizeDraft(value: unknown): Draft {
  const draft = asRecord(value);
  const issueNumber = asNumber(draft.issue_number, Number.NaN);
  const aiDraft = asRecord(draft.ai_draft);
  const humanEdits = draft.human_edits === null ? null : asRecord(draft.human_edits);

  return {
    id: asNumber(draft.id),
    newsletter_id: asNumber(draft.newsletter_id),
    issue_number: Number.isFinite(issueNumber) ? issueNumber : undefined,
    raw_data: normalizeDraftRawData(draft.raw_data),
    ai_draft: {
      sections: normalizeDraftSections(aiDraft.sections),
      errors: asArray(aiDraft.errors).filter((item): item is string => typeof item === "string"),
      generated_at: typeof aiDraft.generated_at === "string" ? aiDraft.generated_at : undefined,
    },
    human_edits:
      humanEdits && Object.keys(humanEdits).length > 0
        ? { sections: normalizeDraftSections(humanEdits.sections) }
        : null,
    status: normalizeDraftStatus(draft.status),
    reviewer_email: asNullableString(draft.reviewer_email),
    reviewed_at: asNullableString(draft.reviewed_at),
    sources_used: Array.isArray(draft.sources_used)
      ? draft.sources_used.filter((item): item is string => typeof item === "string")
      : null,
    sources_warning: Array.isArray(draft.sources_warning)
      ? draft.sources_warning.filter((item): item is string => typeof item === "string")
      : null,
    sources_failed: Array.isArray(draft.sources_failed)
      ? draft.sources_failed.filter((item): item is string => typeof item === "string")
      : null,
    created_at: asString(draft.created_at),
    updated_at: asString(draft.updated_at),
  };
}

export interface Newsletter {
  id: number;
  issue_number: number;
  issue_date: string;
  status: string;
  mailchimp_campaign_id: string | null;
  created_at: string;
}

export interface Article {
  id: number;
  section_type: string;
  title: string;
  teaser: string;
  body: string;
  audience_tag: string;
  publish_date: string | null;
  article_url: string | null;
}

export interface WorkflowLogEntry {
  id: string;
  timestamp: string;
  scope: string;
  step: string;
  status: "info" | "success" | "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
}

export interface IntegrationStatus {
  key: string;
  label: string;
  state: "ready" | "warning" | "blocked";
  summary: string;
  action: string;
}

export async function listDrafts(status?: string): Promise<Draft[]> {
  const query = status ? `?status=${status}` : "";
  const drafts = await fetchApi<unknown[]>(`/api/drafts/${query}`);
  return asArray(drafts).map((draft) => normalizeDraft(draft));
}

export async function getDraft(id: number): Promise<Draft> {
  return normalizeDraft(await fetchApi<unknown>(`/api/drafts/${id}`));
}

export async function updateDraft(
  id: number,
  data: {
    human_edits?: { sections: DraftSection[] };
    status?: string;
    reviewer_email?: string;
    notes?: string;
  }
): Promise<Draft> {
  return normalizeDraft(
    await fetchApi<unknown>(`/api/drafts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  );
}

export async function generateDraft(newsletterId: number): Promise<Draft> {
  return normalizeDraft(
    await fetchApi<unknown>(`/api/drafts/generate/${newsletterId}`, {
      method: "POST",
    }),
  );
}

export async function triggerPipeline(force = false): Promise<{
  newsletter_id: number;
  issue_number: number;
  draft_id: number;
  sources_used: string[];
  sources_warning: string[];
  sources_failed: string[];
  reused_existing: boolean;
  message: string;
}> {
  const url = force ? `/api/pipeline/trigger?force=true` : `/api/pipeline/trigger`;
  return fetchApi(url, { method: "POST" });
}

export interface PipelineJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  force: boolean;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryAfterSeconds: number;
  result: Record<string, unknown> | null;
  error: string | null;
  message?: string;
}

export async function enqueuePipelineJob(force = false): Promise<PipelineJob> {
  const params = new URLSearchParams();
  if (force) {
    params.set("force", "true");
  }
  params.set("async", "true");
  return fetchApi<PipelineJob>(`/api/pipeline/trigger?${params.toString()}`, {
    method: "POST",
  });
}

export async function getPipelineJob(jobId: string): Promise<PipelineJob> {
  return fetchApi<PipelineJob>(`/api/pipeline/jobs/${jobId}`);
}

export async function runPipelineJob(jobId: string): Promise<PipelineJob> {
  return fetchApi<PipelineJob>(`/api/pipeline/jobs/${jobId}/run`, {
    method: "POST",
  });
}

export async function scheduleNewsletter(newsletterId: number): Promise<{
  status: string;
  campaign_id: string;
  article_count?: number;
  preview_sent?: boolean;
  message?: string;
}> {
  return fetchApi(`/api/newsletter/schedule/${newsletterId}`, {
    method: "POST",
  });
}

export async function listNewsletters(): Promise<Newsletter[]> {
  return fetchApi<Newsletter[]>(`/api/newsletter/`);
}

export async function getNewsletterStatus(newsletterId: number): Promise<{
  status: string;
  campaign_id?: string | null;
  mailchimp_status?: Record<string, unknown>;
}> {
  return fetchApi(`/api/newsletter/status/${newsletterId}`);
}

export async function publishArticles(newsletterId: number): Promise<{
  published: number;
  titles: string[];
  article_urls: string[];
}> {
  return fetchApi(`/api/articles/publish/${newsletterId}`, {
    method: "POST",
  });
}

export async function getArticles(newsletterId: number): Promise<Article[]> {
  return fetchApi(`/api/articles/${newsletterId}`);
}

export async function listWorkflowLogs(limit = 40): Promise<WorkflowLogEntry[]> {
  return fetchApi(`/api/logs?limit=${limit}`);
}

export async function getSystemStatus(): Promise<{
  integrations: IntegrationStatus[];
}> {
  return fetchApi(`/api/system/status`);
}
