import { getSettings } from "@/server/env";
import { buildPreviewNewsletterHtmlFromSections } from "@/lib/newsletter-html";
import { appendWorkflowLog } from "@/server/logs";
import { buildHtmlContent } from "@/server/mailchimp";
import type {
  ArticleRecord,
  DraftSection,
  NewsletterRecord,
} from "@/server/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSmtpError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown error";

  if (message.includes("535-5.7.8") || message.includes("BadCredentials")) {
    return "SMTP login failed. Gmail rejected the username or password. Use a Google App Password for SMTP_PASS and make sure SMTP_USER matches that Gmail account.";
  }

  return message;
}

function buildDraftNewsletterPreview(
  newsletterIssue: number,
  sectionsPreview: DraftSection[],
  dashboardUrl: string,
): string {
  return `
    <div style="margin-top:28px;">
      <div style="max-width:680px;margin:0 auto 18px auto;padding:0 8px;font-family:'DM Sans',Arial,sans-serif;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#72262a;font-weight:bold;">Full newsletter preview</div>
        <p style="margin:8px 0 0;color:#5b5147;line-height:1.7;">
          This is the full newsletter layout the reviewer should read before approving the issue.
        </p>
      </div>
      ${buildPreviewNewsletterHtmlFromSections(
        newsletterIssue,
        new Date().toISOString(),
        sectionsPreview,
        dashboardUrl,
      )}
    </div>
  `;
}

async function createTransporter() {
  const nodemailerModule = await import("nodemailer");
  const nodemailer = nodemailerModule.default ?? nodemailerModule;
  const settings = getSettings();

  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpPort === 465,
    auth:
      settings.smtpUser && settings.smtpPass
        ? {
            user: settings.smtpUser,
            pass: settings.smtpPass,
          }
        : undefined,
  });
}

export async function sendReviewNotification(
  draftId: number,
  newsletterIssue: number,
  sectionsPreview: DraftSection[],
): Promise<boolean> {
  const settings = getSettings();

  if (!settings.smtpHost || !settings.reviewerEmail) {
    await appendWorkflowLog({
      scope: "delivery",
      step: "smtp.review_email",
      status: "warning",
      message: "Review email skipped because SMTP_HOST or REVIEWER_EMAIL is missing.",
      context: {
        draft_id: draftId,
        issue_number: newsletterIssue,
      },
    });

    return false;
  }

  const dashboardUrl = `${settings.appPublicUrl.replace(/\/$/, "")}/drafts/${draftId}`;
  const previewHtml = sectionsPreview
    .map(
      (section) => `
        <div style="margin-bottom:16px;padding:12px;background:#f7f5f2;border-radius:4px;border:1px solid #e8e4df;">
          <strong>${escapeHtml(section.title)}</strong>
          <p style="color:#666;margin:4px 0 0;">${escapeHtml(section.teaser)}</p>
        </div>
      `,
    )
    .join("");

  const html = `
    <div style="max-width:760px;margin:0 auto;font-family:'DM Sans',Arial,sans-serif;">
      <div style="background:#1a1a1a;color:white;padding:24px;text-align:center;border-radius:24px 24px 0 0;">
        <h2 style="margin:0;font-family:'Playfair Display',Georgia,serif;">The Disposition Desk</h2>
        <p style="margin:6px 0 0;opacity:0.82;letter-spacing:0.08em;text-transform:uppercase;font-size:12px;">Draft ready for review</p>
      </div>
      <div style="padding:24px;background:#fffdf8;border:1px solid #ede4d8;border-top:0;border-radius:0 0 24px 24px;">
        <p>A new newsletter draft for Issue #${newsletterIssue} is ready for review.</p>
        <h3 style="font-family:'Playfair Display',Georgia,serif;color:#1a1a1a;">Quick section summary</h3>
        ${previewHtml}
        <div style="text-align:center;margin-top:24px;">
          <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#72262a;color:white;text-decoration:none;border-radius:999px;font-size:16px;">
            Review now
          </a>
        </div>
        ${buildDraftNewsletterPreview(newsletterIssue, sectionsPreview, dashboardUrl)}
      </div>
    </div>
  `;

  await appendWorkflowLog({
    scope: "delivery",
    step: "smtp.review_email",
    status: "info",
    message: "Sending review email.",
    context: {
      draft_id: draftId,
      issue_number: newsletterIssue,
      smtp_host: settings.smtpHost,
      reviewer_email: settings.reviewerEmail,
    },
  });

  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      subject: `[Review Needed] Disposition Desk Issue #${newsletterIssue}`,
      from: settings.smtpUser || "newsletter@unitedffs.com",
      to: settings.reviewerEmail,
      html,
    });

    await appendWorkflowLog({
      scope: "delivery",
      step: "smtp.review_email",
      status: "success",
      message: "Review email sent successfully.",
      context: {
        draft_id: draftId,
        issue_number: newsletterIssue,
      },
    });

    return true;
  } catch (error) {
    await appendWorkflowLog({
      scope: "delivery",
      step: "smtp.review_email",
      status: "error",
      message: normalizeSmtpError(error),
      context: {
        draft_id: draftId,
        issue_number: newsletterIssue,
        smtp_host: settings.smtpHost,
      },
    });

    return false;
  }
}

export async function sendNewsletterPreviewEmail(
  newsletter: NewsletterRecord,
  articles: ArticleRecord[],
  options?: {
    draftId?: number | null;
    recipientEmail?: string | null;
    reason?: string | null;
    sectionsPreview?: DraftSection[] | null;
  },
): Promise<boolean> {
  const settings = getSettings();
  const recipient = options?.recipientEmail?.trim() || settings.reviewerEmail;

  if (!settings.smtpHost || !recipient) {
    await appendWorkflowLog({
      scope: "delivery",
      step: "smtp.newsletter_preview",
      status: "warning",
      message: "Preview email skipped because SMTP_HOST or recipient email is missing.",
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
      },
    });

    return false;
  }

  const dashboardUrl = options?.draftId
    ? `${settings.appPublicUrl.replace(/\/$/, "")}/drafts/${options.draftId}`
    : `${settings.appPublicUrl.replace(/\/$/, "")}/history`;
  const noteHtml = `
    <div style="max-width:680px;margin:0 auto 24px auto;padding:24px 28px;background:#fff7eb;border:1px solid #ecd6b2;border-radius:22px;font-family:Arial,sans-serif;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9a6700;font-weight:bold;">Preview copy</div>
      <h2 style="margin:10px 0 12px;font-size:24px;line-height:1.2;color:#10222d;">Issue #${newsletter.issue_number} test send</h2>
      <p style="margin:0 0 12px;color:#5b5147;line-height:1.7;">
        This copy was emailed to you so you can review the latest newsletter before live audience delivery.
      </p>
      ${options?.reason ? `<p style="margin:0 0 12px;color:#5b5147;line-height:1.7;">${escapeHtml(options.reason)}</p>` : ""}
      <a href="${dashboardUrl}" style="display:inline-block;padding:12px 22px;background:#10222d;color:#ffffff;text-decoration:none;border-radius:999px;font-size:13px;font-weight:bold;">
        Open the issue
      </a>
    </div>
  `;

  await appendWorkflowLog({
    scope: "delivery",
    step: "smtp.newsletter_preview",
    status: "info",
    message: "Sending newsletter preview email.",
    context: {
      newsletter_id: newsletter.id,
      issue_number: newsletter.issue_number,
      recipient,
      article_count: articles.length,
    },
  });

  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      subject: `[Preview] Disposition Desk Issue #${newsletter.issue_number}`,
      from: settings.smtpUser || "newsletter@unitedffs.com",
      to: recipient,
      html: `${noteHtml}${buildHtmlContent(newsletter, articles, options?.sectionsPreview ?? undefined)}`,
    });

    await appendWorkflowLog({
      scope: "delivery",
      step: "smtp.newsletter_preview",
      status: "success",
      message: "Newsletter preview email sent successfully.",
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        recipient,
      },
    });

    return true;
  } catch (error) {
    await appendWorkflowLog({
      scope: "delivery",
      step: "smtp.newsletter_preview",
      status: "error",
      message: normalizeSmtpError(error),
      context: {
        newsletter_id: newsletter.id,
        issue_number: newsletter.issue_number,
        recipient,
      },
    });

    return false;
  }
}
