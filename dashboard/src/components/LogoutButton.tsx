"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    setSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push("/login");
      router.refresh();
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={submitting}
      className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {submitting ? "Signing out..." : "Sign out"}
    </button>
  );
}
