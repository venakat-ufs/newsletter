import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";

import { SidebarNav } from "@/components/SidebarNav";
import { TopHeader } from "@/components/TopHeader";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/server/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "United FFS — Dashboard",
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
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen text-[#111827]"
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

        {session ? (
          <div className="flex min-h-screen">
            <SidebarNav />
            <div
              style={{ marginLeft: "var(--sidebar-w)" }}
              className="flex-1 flex flex-col min-h-screen"
            >
              <TopHeader />
              <main suppressHydrationWarning className="flex-1 p-6 lg:p-8">
                {children}
              </main>
            </div>
          </div>
        ) : (
          <main suppressHydrationWarning className="min-h-screen">
            {children}
          </main>
        )}
      </body>
    </html>
  );
}
