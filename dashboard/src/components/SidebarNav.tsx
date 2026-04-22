"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 6h8M5 9h8M5 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/insights/listings",
    label: "Insights",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 14l4-4 3 3 4-5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/data",
    label: "Data View",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L2 7v9h5v-5h4v5h5V7L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/reo",
    label: "REO Hub",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4 2h7l3 3v11H4V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M11 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 8h6M6 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

function UnitedLogo() {
  return (
    <img src="/logo.jpeg" alt="United Field Services" width={42} height={42} style={{ objectFit: "contain" }} />
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/?");
  return pathname.startsWith(href);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside
      style={{ width: "var(--sidebar-w)" }}
      className="fixed top-0 left-0 h-screen bg-white border-r border-[#E5E7EB] flex flex-col z-20"
    >
      {/* Logo */}
      <div className="flex items-center px-4 py-4 border-b border-[#E5E7EB]">
        <UnitedLogo />
      </div>

      {/* Nav label */}
      <div className="px-5 pt-5 pb-2">
        <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.12em]">
          NAVIGATION
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#EFF6FF] text-[#2563EB]"
                  : "text-[#374151] hover:bg-[#F9FAFB] hover:text-[#111827]"
              }`}
            >
              <span className={active ? "text-[#2563EB]" : "text-[#6B7280]"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom feedback + logout */}
      <div className="px-4 py-4 border-t border-[#E5E7EB] space-y-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#F9FAFB] cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1C4.134 1 1 4.134 1 8c0 1.18.302 2.29.832 3.254L1 15l3.746-.832A6.966 6.966 0 008 15c3.866 0 7-3.134 7-7s-3.134-7-7-7z"
                stroke="#2563EB"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium text-[#374151] leading-none">Your Feedback Matters</div>
            <div className="text-[11px] text-[#9CA3AF] mt-0.5">Help us improve</div>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
