import fs from "fs";

import { resolveDashboardPath, resolveRepoPath } from "@/server/paths";

export interface Settings {
  openaiApiKey: string;
  grokApiKey: string;
  redditClientId: string;
  redditClientSecret: string;
  redditUserAgent: string;
  newsApiKey: string;
  zillowRapidApiKey: string;
  zillowRapidApiHost: string;
  zillowRapidApiZpids: string[];
  indeedJobsEnabled: boolean;
  freeJobsSourcesEnabled: boolean;
  freeListingSignalsEnabled: boolean;
  homestepsConcurrency: number;
  homepathEnabled: boolean;
  homepathCookie: string;
  mailchimpApiKey: string;
  mailchimpServerPrefix: string;
  mailchimpListId: string;
  mailchimpTemplateId: string;
  mailchimpOnHold: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  reviewerEmail: string;
  msPlatformApiUrl: string;
  msPlatformApiKey: string;
  apiHost: string;
  apiPort: number;
  appPublicUrl: string;
  databaseUrl: string;
  authUsername: string;
  authPassword: string;
  authSessionSecret: string;
}

let cachedSettings: Settings | null = null;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);
  const values: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function toNumber(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function toBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function toStringList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSettings(): Settings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const env = {
    ...parseEnvFile(resolveRepoPath(".env")),
    ...parseEnvFile(resolveDashboardPath(".env")),
    ...parseEnvFile(resolveDashboardPath(".env.local")),
    ...process.env,
  };

  cachedSettings = {
    openaiApiKey: env.OPENAI_API_KEY ?? "",
    grokApiKey: env.GROK_API_KEY ?? "",
    redditClientId: env.REDDIT_CLIENT_ID ?? "",
    redditClientSecret: env.REDDIT_CLIENT_SECRET ?? "",
    redditUserAgent: env.REDDIT_USER_AGENT ?? "ufs-newsletter/1.0",
    newsApiKey: env.NEWS_API_KEY ?? "",
    zillowRapidApiKey: env.ZILLOW_RAPIDAPI_KEY ?? "",
    zillowRapidApiHost: env.ZILLOW_RAPIDAPI_HOST ?? "us-housing-market-data1.p.rapidapi.com",
    zillowRapidApiZpids: toStringList(env.ZILLOW_RAPIDAPI_ZPIDS),
    indeedJobsEnabled: toBoolean(env.INDEED_JOBS_ENABLED, false),
    freeJobsSourcesEnabled: toBoolean(env.FREE_JOBS_SOURCES_ENABLED, true),
    freeListingSignalsEnabled: toBoolean(env.FREE_LISTING_SIGNALS_ENABLED, true),
    homestepsConcurrency: Math.max(1, toNumber(env.HOMESTEPS_CONCURRENCY, 6)),
    homepathEnabled: toBoolean(env.HOMEPATH_ENABLED, false),
    homepathCookie: env.HOMEPATH_COOKIE ?? "",
    mailchimpApiKey: env.MAILCHIMP_API_KEY ?? "",
    mailchimpServerPrefix: env.MAILCHIMP_SERVER_PREFIX ?? "",
    mailchimpListId: env.MAILCHIMP_LIST_ID ?? "",
    mailchimpTemplateId: env.MAILCHIMP_TEMPLATE_ID ?? "",
    mailchimpOnHold: toBoolean(env.MAILCHIMP_ON_HOLD, true),
    smtpHost: env.SMTP_HOST ?? "",
    smtpPort: toNumber(env.SMTP_PORT, 587),
    smtpUser: env.SMTP_USER ?? "",
    smtpPass: env.SMTP_PASS ?? "",
    reviewerEmail: env.REVIEWER_EMAIL ?? "",
    msPlatformApiUrl: env.MS_PLATFORM_API_URL ?? "",
    msPlatformApiKey: env.MS_PLATFORM_API_KEY ?? "",
    apiHost: env.API_HOST ?? "0.0.0.0",
    apiPort: toNumber(env.API_PORT, 3000),
    appPublicUrl:
      env.APP_PUBLIC_URL ?? env.DASHBOARD_URL ?? env.API_PUBLIC_URL ?? "http://localhost:3000",
    databaseUrl: env.DATABASE_URL ?? "file:../../data/ufs-newsletter.db",
    authUsername: env.AUTH_USERNAME ?? "",
    authPassword: env.AUTH_PASSWORD ?? "",
    authSessionSecret: (() => {
      const s = env.AUTH_SESSION_SECRET ?? "";
      if (!s) throw new Error("AUTH_SESSION_SECRET must be set to a long random string.");
      return s;
    })(),
  };

  return cachedSettings;
}
