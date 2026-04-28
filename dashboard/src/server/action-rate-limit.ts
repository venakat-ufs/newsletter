const globalStore = globalThis as typeof globalThis & {
  __ufsActionRateLimit?: Map<string, { count: number; windowStart: number }>;
};

const store =
  globalStore.__ufsActionRateLimit ?? new Map<string, { count: number; windowStart: number }>();
globalStore.__ufsActionRateLimit = store;

export function checkActionRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= maxRequests) {
    const retryAfterMs = windowMs - (now - existing.windowStart);
    return { allowed: false, retryAfterMs };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
