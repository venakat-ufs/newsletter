"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function SsoRedirectClient() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("next") ?? "";
    const destination = raw.startsWith("/insights/") ? raw : "/insights/latest";
    window.location.replace(destination);
  }, [searchParams]);

  return null;
}
