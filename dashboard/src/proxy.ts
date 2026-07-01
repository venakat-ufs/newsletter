import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, verifySessionToken } from "@/server/auth";
import { verifySsoToken } from "@/server/sso";

const SSO_COOKIE_NAME = "ufs_insights_sso";
const SSO_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 hours

function isPublicPath(pathname: string): boolean {
  if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(pathname)) {
    return true;
  }

  if (
    pathname === "/login" ||
    pathname === "/join" ||
    pathname === "/favicon.ico" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/health"
  ) {
    return true;
  }

  if (pathname.startsWith("/_next/")) {
    return true;
  }

  if (pathname.startsWith("/api/articles/public/")) {
    return true;
  }

  return false;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (session) {
    return NextResponse.next();
  }

  // SSO access for /insights/* — clients from clients-unitedffs portal
  if (pathname.startsWith("/insights/")) {
    // Check for one-time SSO token in query string
    const ssoToken = request.nextUrl.searchParams.get("token");
    if (ssoToken) {
      const valid = await verifySsoToken(ssoToken);
      if (valid) {
        // Redirect to the same URL without the token so the cookie is guaranteed
        // to be set before any subsequent route handler redirects fire.
        const cleanUrl = new URL(request.url);
        cleanUrl.searchParams.delete("token");
        const isSecure =
          process.env.NODE_ENV === "production" &&
          process.env.COOKIE_SECURE !== "false";
        const response = NextResponse.redirect(cleanUrl);
        response.cookies.set(SSO_COOKIE_NAME, "1", {
          httpOnly: true,
          sameSite: "lax",
          secure: isSecure,
          path: "/",
          maxAge: SSO_COOKIE_MAX_AGE_SECONDS,
        });
        return response;
      }
    }

    // Check for existing SSO session cookie (set on a previous valid token visit)
    const ssoCookie = request.cookies.get(SSO_COOKIE_NAME)?.value;
    if (ssoCookie === "1") {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/api/")) {
    // Allow SSO cookie holders to access API routes needed by insights pages
    const ssoCookie = request.cookies.get(SSO_COOKIE_NAME)?.value;
    if (ssoCookie === "1") {
      return NextResponse.next();
    }
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
