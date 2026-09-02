import { ensureDatabaseReady, prisma } from "@/server/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface InMemoryAttempt {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __ufsLoginRateLimit?: Map<string, InMemoryAttempt>;
};

const inMemoryAttempts =
  globalForRateLimit.__ufsLoginRateLimit ?? new Map<string, InMemoryAttempt>();

globalForRateLimit.__ufsLoginRateLimit = inMemoryAttempts;

function nowMs(): number {
  return Date.now();
}

function nowIso(): string {
  return new Date().toISOString();
}

function inSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function parseIpFromForwarded(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  const first = value.split(",")[0]?.trim();
  return first || "unknown";
}

export function getClientIp(request: Request): string {
  const ipFromForwarded = parseIpFromForwarded(request.headers.get("x-forwarded-for"));
  if (ipFromForwarded !== "unknown") {
    return ipFromForwarded;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getLoginRateLimitKey(username: string, ipAddress: string): string {
  const normalizedUsername = username.trim().toLowerCase() || "unknown-user";
  const normalizedIp = ipAddress.trim() || "unknown-ip";
  return `${normalizedUsername}:${normalizedIp}`;
}

async function checkRateLimitFromDatabase(
  key: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  await ensureDatabaseReady();
  const now = nowMs();
  const nowText = nowIso();
  const attempt = await prisma.loginAttempt.findUnique({ where: { key } });
  if (!attempt) {
    return { allowed: true };
  }

  const blockedUntilMs = attempt.blockedUntil ? Date.parse(attempt.blockedUntil) : Number.NaN;
  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
    return {
      allowed: false,
      retryAfterSeconds: inSeconds(blockedUntilMs - now),
    };
  }

  const windowStartedMs = Date.parse(attempt.windowStartedAt);
  if (!Number.isFinite(windowStartedMs) || now - windowStartedMs > WINDOW_MS) {
    await prisma.loginAttempt.update({
      where: { key },
      data: {
        attempts: 0,
        windowStartedAt: nowText,
        blockedUntil: null,
        updatedAt: nowText,
      },
    });
  }

  return { allowed: true };
}

function checkRateLimitInMemory(
  key: string,
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = nowMs();
  const existing = inMemoryAttempts.get(key);
  if (!existing) {
    return { allowed: true };
  }

  if (existing.blockedUntil && existing.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: inSeconds(existing.blockedUntil - now),
    };
  }

  if (now - existing.windowStartedAt > WINDOW_MS) {
    inMemoryAttempts.set(key, {
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: null,
    });
  }

  return { allowed: true };
}

export async function checkLoginRateLimit(
  key: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  try {
    return await checkRateLimitFromDatabase(key);
  } catch {
    return checkRateLimitInMemory(key);
  }
}

async function recordFailedLoginInDatabase(key: string): Promise<void> {
  await ensureDatabaseReady();
  const now = nowMs();
  const nowText = nowIso();
  const windowCutoff = new Date(now - WINDOW_MS).toISOString();

  // A prior version of this function did "UPDATE if row exists and window
  // is fresh, else UPSERT to attempts=1" as two separate steps. That left a
  // real race: when several requests are ALL the first-ever attempt for a
  // brand-new key, none of them sees the others' not-yet-committed insert,
  // so multiple can take the "create at attempts=1" path at once and the
  // final count lands under MAX_ATTEMPTS instead of at it.
  //
  // INSERT ... ON CONFLICT ... DO UPDATE is a single atomic statement at the
  // database level - there is no window between "check" and "write" for
  // Postgres to interleave two callers in, no matter how many requests hit
  // a brand-new key at the exact same instant. window_started_at is stored
  // as ISO-8601 UTC text (e.g. "2026-09-02T12:00:00.000Z"), which sorts
  // lexicographically the same as chronologically, so plain text comparison
  // is safe here without a timestamp cast.
  const rows = await prisma.$queryRaw<Array<{ attempts: number; blocked_until: string | null }>>`
    INSERT INTO "login_attempts" (key, attempts, window_started_at, blocked_until, updated_at)
    VALUES (${key}, 1, ${nowText}, NULL, ${nowText})
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE
        WHEN login_attempts.window_started_at <= ${windowCutoff} THEN 1
        ELSE login_attempts.attempts + 1
      END,
      window_started_at = CASE
        WHEN login_attempts.window_started_at <= ${windowCutoff} THEN ${nowText}
        ELSE login_attempts.window_started_at
      END,
      blocked_until = CASE
        WHEN login_attempts.window_started_at <= ${windowCutoff} THEN NULL
        ELSE login_attempts.blocked_until
      END,
      updated_at = ${nowText}
    RETURNING attempts, blocked_until
  `;

  const result = rows[0];
  if (result && result.attempts >= MAX_ATTEMPTS && !result.blocked_until) {
    await prisma.loginAttempt.update({
      where: { key },
      data: { blockedUntil: new Date(now + BLOCK_MS).toISOString() },
    });
  }
}

function recordFailedLoginInMemory(key: string): void {
  const now = nowMs();
  const current = inMemoryAttempts.get(key);

  if (!current) {
    inMemoryAttempts.set(key, {
      attempts: 1,
      windowStartedAt: now,
      blockedUntil: null,
    });
    return;
  }

  if (now - current.windowStartedAt > WINDOW_MS) {
    inMemoryAttempts.set(key, {
      attempts: 1,
      windowStartedAt: now,
      blockedUntil: null,
    });
    return;
  }

  const attempts = current.attempts + 1;
  const blockedUntil = attempts >= MAX_ATTEMPTS ? now + BLOCK_MS : null;

  inMemoryAttempts.set(key, {
    attempts,
    windowStartedAt: current.windowStartedAt,
    blockedUntil,
  });
}

export async function recordFailedLogin(key: string): Promise<void> {
  try {
    await recordFailedLoginInDatabase(key);
  } catch {
    recordFailedLoginInMemory(key);
  }
}

async function clearLoginRateLimitInDatabase(key: string): Promise<void> {
  await ensureDatabaseReady();
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

function clearLoginRateLimitInMemory(key: string): void {
  inMemoryAttempts.delete(key);
}

export async function clearLoginRateLimit(key: string): Promise<void> {
  try {
    await clearLoginRateLimitInDatabase(key);
  } catch {
    clearLoginRateLimitInMemory(key);
  }
}

