"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/history": "Orders List",
  "/data": "Properties",
  "/reo": "Proposals",
  "/insights/listings": "Listings",
  "/insights/news": "News",
  "/insights/pulse": "Market Pulse",
};

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [key, val] of Object.entries(PAGE_TITLES)) {
    if (key !== "/" && pathname.startsWith(key)) return val;
  }
  return "Dashboard";
}

export function TopHeader() {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-8 h-16 flex items-center justify-between flex-shrink-0">
      <h1 className="text-base font-semibold text-[#111827]">{title}</h1>
      <div className="flex items-center gap-2">
        {/* Help */}
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#6B7280] transition-colors"
          aria-label="Help"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M6.75 6.75a2.25 2.25 0 114.5 0c0 1.5-2.25 1.875-2.25 3.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="9" cy="13.5" r="0.75" fill="currentColor" />
          </svg>
        </button>

        {/* Notifications */}
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#6B7280] transition-colors"
          aria-label="Notifications"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M9 2a5.5 5.5 0 00-5.5 5.5v2L2 11.5h14l-1.5-2V7.5A5.5 5.5 0 009 2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M7 11.5c0 1.105.895 2 2 2s2-.895 2-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Profile avatar */}
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8]"
          aria-label="Profile"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
