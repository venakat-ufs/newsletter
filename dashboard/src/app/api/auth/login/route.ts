import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  validateCredentials,
} from "@/server/auth";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  getClientIp,
  getLoginRateLimitKey,
  recordFailedLogin,
} from "@/server/login-rate-limit";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";
    const ipAddress = getClientIp(request);
    const rateLimitKey = getLoginRateLimitKey(username, ipAddress);

    if (!username || !password) {
      return NextResponse.json(
        { detail: "Username and password are required." },
        { status: 400 },
      );
    }

    const throttle = await checkLoginRateLimit(rateLimitKey);
    if (!throttle.allowed) {
      return NextResponse.json(
        {
          detail: "Too many failed login attempts. Try again shortly.",
          retry_after: throttle.retryAfterSeconds ?? 60,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(throttle.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    const valid = await validateCredentials(username, password);
    if (!valid) {
      await recordFailedLogin(rateLimitKey);
      return NextResponse.json({ detail: "Invalid credentials." }, { status: 401 });
    }

    await clearLoginRateLimit(rateLimitKey);

    const token = await createSessionToken(username);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return NextResponse.json({ detail: "Unable to complete login request." }, { status: 500 });
  }
}
