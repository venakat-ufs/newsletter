const textEncoder = new TextEncoder();

export const AUTH_COOKIE_NAME = "ufs_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export interface AuthConfig {
  username: string;
  password: string;
  sessionSecret: string;
}

export interface SessionPayload {
  username: string;
  expiresAt: number;
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return hexFromBytes(new Uint8Array(signature));
}

export function getAuthConfig(): AuthConfig {
  const username = process.env.AUTH_USERNAME ?? "";
  const password = process.env.AUTH_PASSWORD ?? "";
  const sessionSecret = process.env.AUTH_SESSION_SECRET ?? "";

  if (!username || !password || !sessionSecret) {
    throw new Error(
      "AUTH_USERNAME, AUTH_PASSWORD, and AUTH_SESSION_SECRET must be configured.",
    );
  }

  return {
    username,
    password,
    sessionSecret,
  };
}

export async function validateCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const config = getAuthConfig();
  return (
    constantTimeEqual(username.trim(), config.username) &&
    constantTimeEqual(password, config.password)
  );
}

export async function createSessionToken(username: string): Promise<string> {
  const { sessionSecret } = getAuthConfig();
  const expiresAt = Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000;
  const encodedUsername = encodeURIComponent(username);
  const payload = `${encodedUsername}|${expiresAt}`;
  const signature = await signValue(payload, sessionSecret);
  return `${payload}|${signature}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  const parts = token.split("|");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedUsername, expiresAtRaw, signature] = parts;
  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const { sessionSecret } = getAuthConfig();
  const expectedSignature = await signValue(
    `${encodedUsername}|${expiresAtRaw}`,
    sessionSecret,
  );

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  return {
    username: decodeURIComponent(encodedUsername),
    expiresAt,
  };
}
