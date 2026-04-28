"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service in production
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-xl border border-red-200 bg-red-50 px-8 py-10 shadow-sm" style={{ maxWidth: 480 }}>
        <div className="text-3xl">⚠</div>
        <h2 className="mt-3 text-lg font-semibold text-[#111827]">Something went wrong</h2>
        <p className="mt-2 text-sm text-[#6B7280]">
          {error.message ?? "An unexpected error occurred. Please try again."}
        </p>
        {error.digest ? (
          <p className="mt-1 font-mono text-[10px] text-[#9CA3AF]">ref: {error.digest}</p>
        ) : null}
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-[#2563EB] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
