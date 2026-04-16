import { getSettings } from "@/server/env";
import { listWorkflowLogs, type WorkflowLogEntry } from "@/server/logs";

export interface IntegrationStatus {
  key: string;
  label: string;
  state: "ready" | "warning" | "blocked";
  summary: string;
  action: string;
}

function latestLogForIntegration(
  logs: WorkflowLogEntry[],
  key: IntegrationStatus["key"],
): WorkflowLogEntry | undefined {
  return logs.find((entry) => {
    const source = entry.context?.source;
    const requestedSource = entry.context?.requested_source;

    if (key === "openai") {
      return entry.scope === "drafting";
    }
    if (key === "smtp") {
      return entry.step === "smtp.review_email";
    }
    if (key === "mailchimp") {
      return entry.step.startsWith("mailchimp.") || entry.step === "newsletter.schedule";
    }

    return source === key || requestedSource === key || entry.step === key;
  });
}

function withRecentLogStatus(
  status: IntegrationStatus,
  logs: WorkflowLogEntry[],
): IntegrationStatus {
  const latest = latestLogForIntegration(logs, status.key);
  if (!latest || latest.status === "info" || latest.status === "success") {
    return status;
  }

  const nextState =
    latest.status === "error"
      ? status.state === "ready"
        ? "warning"
        : status.state
      : status.state === "ready"
        ? "warning"
        : status.state;

  return {
    ...status,
    state: nextState,
    summary: `${status.summary} Latest activity: ${latest.message}`,
  };
}

export async function getSystemStatus(): Promise<{
  integrations: IntegrationStatus[];
}> {
  const settings = getSettings();
  const recentLogs = await listWorkflowLogs(120);

  const integrations = [
      {
        key: "openai",
        label: "OpenAI drafting",
        state: settings.openaiApiKey ? "ready" : "blocked",
        summary: settings.openaiApiKey
          ? "Configured for AI section generation."
          : "OPENAI_API_KEY is missing, so AI draft generation cannot run.",
        action: settings.openaiApiKey ? "Generate sections after pipeline." : "Add OPENAI_API_KEY.",
      },
      {
        key: "grok",
        label: "Grok / X search",
        state: settings.grokApiKey ? "ready" : "warning",
        summary: settings.grokApiKey
          ? "Configured for X search enrichment."
          : "GROK_API_KEY is missing, so this source is skipped.",
        action: settings.grokApiKey ? "Review source logs after pipeline." : "Add GROK_API_KEY or rely on other sources.",
      },
      {
        key: "reddit",
        label: "Reddit",
        state: settings.redditClientId && settings.redditClientSecret ? "ready" : "blocked",
        summary: settings.redditClientId && settings.redditClientSecret
          ? "Reddit OAuth credentials configured — community sentiment collection is enabled."
          : "Reddit requires OAuth credentials (REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET). Register a free script app at reddit.com/prefs/apps.",
        action: settings.redditClientId && settings.redditClientSecret
          ? "Review subreddit posts in source logs after each pipeline run."
          : "Go to reddit.com/prefs/apps → create app → script type → add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to Vercel env vars.",
      },
      {
        key: "williams_auction",
        label: "Williams & Williams Auctions",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "Williams & Williams REO auction listing signals are enabled."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review listing signal counts and sample links after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "real_estate_sales_gov",
        label: "RealEstateSales.gov (GSA)",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "GSA government property auction signals are enabled."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review listing signal counts and sample links after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "bid4assets",
        label: "Bid4Assets (Sheriff & Tax Sales)",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "Bid4Assets county sheriff sales and tax lien auction signals are enabled. Covers CA, FL, PA, TX, and other active auction counties with no login required."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review sheriff sale and county tax auction listing counts after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "news_api",
        label: "News API",
        state: settings.newsApiKey ? "ready" : "blocked",
        summary: settings.newsApiKey
          ? "Live news queries are enabled."
          : "NEWS_API_KEY is missing, so this source is skipped.",
        action: settings.newsApiKey ? "Review headline quality in source logs." : "Add NEWS_API_KEY for live news.",
      },
      {
        key: "zillow_research",
        label: "Zillow Research",
        state: "ready",
        summary: "Official Zillow MediaRoom research feeds are enabled.",
        action: "Review fresh research items after each pipeline run.",
      },
      {
        key: "zillow_rapidapi",
        label: "Zillow RapidAPI",
        state:
          settings.zillowRapidApiKey && settings.zillowRapidApiZpids.length > 0
            ? "ready"
            : "warning",
        summary:
          settings.zillowRapidApiKey && settings.zillowRapidApiZpids.length > 0
            ? "Tracked Zillow property pulls are enabled through RapidAPI."
            : "RapidAPI property tracking is configured only when both ZILLOW_RAPIDAPI_KEY and ZILLOW_RAPIDAPI_ZPIDS are set.",
        action:
          settings.zillowRapidApiKey && settings.zillowRapidApiZpids.length > 0
            ? "Review tracked property results after each pipeline run."
            : "Add ZILLOW_RAPIDAPI_KEY and one or more comma-separated ZILLOW_RAPIDAPI_ZPIDS.",
      },
      {
        key: "hud_homestore",
        label: "HUD Home Store",
        state: "ready",
        summary: "Official HUD Home Store listing discovery is enabled.",
        action: "Check the latest pipeline log for live inventory counts by state.",
      },
      {
        key: "homesteps",
        label: "HomeSteps",
        state: "ready",
        summary: "Freddie Mac HomeSteps search pulls are enabled.",
        action: "Review market counts and sample listings after each run.",
      },
      {
        key: "bank_of_america_reo",
        label: "Bank of America REO",
        state: "ready",
        summary: "Official Bank of America REO discovery is enabled.",
        action: "Check the latest pipeline log for active markets and listing signals.",
      },
      {
        key: "linkedin_jobs",
        label: "LinkedIn Jobs",
        state: "ready",
        summary: "LinkedIn guest job-search pulls are enabled for REO and servicing hiring signals.",
        action: "Review hiring counts and sample roles after each pipeline run.",
      },
      {
        key: "google_jobs",
        label: "Google Jobs Signals",
        state: "blocked",
        summary: "Removed — permanently returns HTTP 403 on all server-side requests. Cannot be collected without a browser session.",
        action: "No action available. Source removed from pipeline.",
      },
      {
        key: "ziprecruiter_jobs",
        label: "ZipRecruiter Jobs",
        state: "blocked",
        summary: "Removed — permanently returns HTTP 403 on all server-side requests.",
        action: "No action available. Source removed from pipeline.",
      },
      {
        key: "company_career_jobs",
        label: "Company Career Pages",
        state: "blocked",
        summary: "Removed — Wells Fargo and other career sites return HTTP 403 on all server-side requests.",
        action: "No action available. Source removed from pipeline.",
      },
      {
        key: "usajobs_jobs",
        label: "USAJobs",
        state: settings.freeJobsSourcesEnabled ? "ready" : "blocked",
        summary: settings.freeJobsSourcesEnabled
          ? "USAJobs hiring-signal collection is enabled."
          : "Free jobs-source collection is disabled.",
        action: settings.freeJobsSourcesEnabled
          ? "Review government hiring signals after each pipeline run."
          : "Set FREE_JOBS_SOURCES_ENABLED=true to collect USAJobs signals.",
      },
      {
        key: "greenhouse_jobs",
        label: "Greenhouse Jobs",
        state: settings.freeJobsSourcesEnabled ? "ready" : "blocked",
        summary: settings.freeJobsSourcesEnabled
          ? "Greenhouse board signal collection is enabled."
          : "Free jobs-source collection is disabled.",
        action: settings.freeJobsSourcesEnabled
          ? "Review Greenhouse hiring signals after each pipeline run."
          : "Set FREE_JOBS_SOURCES_ENABLED=true to collect Greenhouse signals.",
      },
      {
        key: "lever_jobs",
        label: "Lever Jobs",
        state: settings.freeJobsSourcesEnabled ? "ready" : "blocked",
        summary: settings.freeJobsSourcesEnabled
          ? "Lever board signal collection is enabled."
          : "Free jobs-source collection is disabled.",
        action: settings.freeJobsSourcesEnabled
          ? "Review Lever hiring signals after each pipeline run."
          : "Set FREE_JOBS_SOURCES_ENABLED=true to collect Lever signals.",
      },
      {
        key: "indeed_jobs",
        label: "Indeed Jobs",
        state: settings.indeedJobsEnabled ? "warning" : "blocked",
        summary: settings.indeedJobsEnabled
          ? "Indeed direct scraping is enabled, but anti-bot checks may still block the runtime."
          : "Indeed job collection is on hold by default because direct scraping is frequently blocked.",
        action: settings.indeedJobsEnabled
          ? "If it still fails, move this lane to Apify or another worker-based fetch path."
          : "Set INDEED_JOBS_ENABLED=true only when you have a stable access path for Indeed.",
      },
      {
        key: "auction_com",
        label: "Auction.com",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "Auction.com listing-signal collection is enabled."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review listing signal counts and sample links after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "hubzu",
        label: "Hubzu",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "Hubzu listing-signal collection is enabled."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review listing signal counts and sample links after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "xome",
        label: "Xome",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "Xome listing-signal collection is enabled."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review listing signal counts and sample links after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "realtor_foreclosure",
        label: "Realtor.com Foreclosures",
        state: settings.freeListingSignalsEnabled ? "ready" : "blocked",
        summary: settings.freeListingSignalsEnabled
          ? "Realtor foreclosure signal collection is enabled."
          : "Free listing-signal collection is disabled.",
        action: settings.freeListingSignalsEnabled
          ? "Review listing signal counts and sample links after each pipeline run."
          : "Set FREE_LISTING_SIGNALS_ENABLED=true to enable free listing lanes.",
      },
      {
        key: "homepath",
        label: "HomePath (Fannie Mae)",
        state: "blocked",
        summary: "HomePath is permanently blocked — fanniemae.com returns 403 CloudFront for all server-side access. This source cannot be collected without a browser session.",
        action: "No action available. HomePath blocks all automated access.",
      },
      {
        key: "smtp",
        label: "SMTP review email",
        state:
          settings.smtpHost && settings.smtpUser && settings.smtpPass && settings.reviewerEmail
            ? "ready"
            : "warning",
        summary:
          settings.smtpHost && settings.smtpUser && settings.smtpPass && settings.reviewerEmail
            ? "Credentials are present, but delivery still depends on provider auth."
            : "One or more SMTP settings are missing.",
        action:
          settings.smtpHost && settings.smtpUser && settings.smtpPass && settings.reviewerEmail
            ? "Trigger a review email and inspect logs for auth errors."
            : "Complete SMTP_HOST, SMTP_USER, SMTP_PASS, and REVIEWER_EMAIL.",
      },
      {
        key: "mailchimp",
        label: "Mailchimp send",
        state: settings.mailchimpOnHold
          ? "warning"
          :
          settings.mailchimpApiKey && settings.mailchimpServerPrefix && settings.mailchimpListId
            ? "ready"
            : "blocked",
        summary: settings.mailchimpOnHold
          ? "Mailchimp delivery is intentionally on hold. Approval sends a reviewer preview copy instead."
          :
          settings.mailchimpApiKey && settings.mailchimpServerPrefix && settings.mailchimpListId
            ? "Audience delivery is configured."
            : "Mailchimp is incomplete. Approval can still send a preview copy, but live audience delivery needs API key, server prefix, and list id.",
        action: settings.mailchimpOnHold
          ? "Keep reviewing with preview emails, or set MAILCHIMP_ON_HOLD=false when you are ready for live scheduling."
          :
          settings.mailchimpApiKey && settings.mailchimpServerPrefix && settings.mailchimpListId
            ? "Approve and send when the issue is ready."
            : "Fill MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, and MAILCHIMP_LIST_ID for live audience sends.",
      },
    ] satisfies IntegrationStatus[];

  return {
    integrations: integrations.map((item) => withRecentLogStatus(item, recentLogs)),
  };
}
