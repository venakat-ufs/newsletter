import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import Script from "next/script";

import { LogoutButton } from "@/components/LogoutButton";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/server/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "The Disposition Desk — Newsletter Dashboard",
  description: "UFS Weekly REO Newsletter Management System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen text-[#1a1a1a]"
      >
        <Script id="strip-extension-user-select-style" strategy="beforeInteractive">
          {`
            (() => {
              const cleanStyle = (element) => {
                if (!(element instanceof HTMLElement)) return;
                const style = element.getAttribute("style");
                if (!style) return;
                const cleaned = style
                  .replace(/(^|;)\\s*user-select\\s*:\\s*auto\\s*;?/gi, "$1")
                  .replace(/;;+/g, ";")
                  .replace(/^\\s*;|;\\s*$/g, "")
                  .trim();
                if (!cleaned) {
                  element.removeAttribute("style");
                } else if (cleaned !== style.trim()) {
                  element.setAttribute("style", cleaned);
                }
              };

              const scan = () => {
                document.querySelectorAll("[style]").forEach((node) => cleanStyle(node));
              };

              scan();

              const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                  if (mutation.type === "attributes" && mutation.attributeName === "style") {
                    cleanStyle(mutation.target);
                  }
                }
              });

              observer.observe(document.documentElement, {
                attributes: true,
                subtree: true,
                attributeFilter: ["style"],
              });

              window.addEventListener(
                "load",
                () => {
                  window.setTimeout(() => observer.disconnect(), 2000);
                },
                { once: true },
              );
            })();
          `}
        </Script>

        <nav
          suppressHydrationWarning
          className="sticky top-0 z-20 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(26,26,26,0.92)] text-white backdrop-blur-xl shadow-[0_12px_40px_rgba(26,26,26,0.22)]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Link href="/" className="group flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#72262a] text-sm font-semibold ring-1 ring-white/10 transition group-hover:bg-[#5a1e1f]">
                    UFS
                  </span>
                  <div>
                    <div className="font-display text-lg font-semibold leading-none">
                      The Disposition Desk
                    </div>
                    <div className="text-xs uppercase tracking-[0.28em] text-white/45">
                      Editorial Console
                    </div>
                  </div>
                </Link>
              </div>
              {session ? (
                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="rounded-full px-4 py-2 text-sm font-medium text-white/72 transition hover:bg-white/8 hover:text-white"
                  >
                    Drafts
                  </Link>
                  <Link
                    href="/history"
                    className="rounded-full px-4 py-2 text-sm font-medium text-white/72 transition hover:bg-white/8 hover:text-white"
                  >
                    History
                  </Link>
                  <Link
                    href="/data"
                    className="rounded-full px-4 py-2 text-sm font-medium text-white/72 transition hover:bg-white/8 hover:text-white"
                  >
                    Data
                  </Link>
                  <Link
                    href="/?tour=1"
                    className="rounded-full px-4 py-2 text-sm font-medium text-white/72 transition hover:bg-white/8 hover:text-white"
                  >
                    Tour
                  </Link>
                  <LogoutButton />
                </div>
              ) : null}
            </div>
          </div>
        </nav>
        <main
          suppressHydrationWarning
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
