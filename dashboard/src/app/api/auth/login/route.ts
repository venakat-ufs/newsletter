import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  validateCredentials,
} from "@/server/auth";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { detail: "Username and password are required." },
        { status: 400 },
      );
    }

    const valid = await validateCredentials(username, password);
    if (!valid) {
      return NextResponse.json({ detail: "Invalid credentials." }, { status: 401 });
    }

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
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unable to complete login request.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
