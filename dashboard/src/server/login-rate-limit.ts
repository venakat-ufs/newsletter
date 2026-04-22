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
  const current = await prisma.loginAttempt.findUnique({ where: { key } });

  if (!current) {
    await prisma.loginAttempt.create({
      data: {
        key,
        attempts: 1,
        windowStartedAt: nowText,
        blockedUntil: null,
        updatedAt: nowText,
      },
    });
    return;
  }

  const currentWindowMs = Date.parse(current.windowStartedAt);
  const windowExpired = !Number.isFinite(currentWindowMs) || now - currentWindowMs > WINDOW_MS;

  if (windowExpired) {
    await prisma.loginAttempt.update({
      where: { key },
      data: {
        attempts: 1,
        windowStartedAt: nowText,
        blockedUntil: null,
        updatedAt: nowText,
      },
    });
    return;
  }

  const nextAttempts = current.attempts + 1;
  const blockedUntil = nextAttempts >= MAX_ATTEMPTS ? new Date(now + BLOCK_MS).toISOString() : null;

  await prisma.loginAttempt.update({
    where: { key },
    data: {
      attempts: nextAttempts,
      blockedUntil,
      updatedAt: nowText,
    },
  });
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

