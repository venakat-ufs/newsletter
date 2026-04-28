"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DraftEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-[32px] border border-white/70 bg-white/80 px-8 py-16 text-center shadow-[0_28px_80px_rgba(26,26,26,0.10)]">
      <div className="text-3xl">⚠</div>
      <h2 className="mt-3 text-xl font-semibold text-[#1a1a1a]">Failed to load draft</h2>
      <p className="mt-2 text-sm text-[#65584d]">
        {error.message ?? "An unexpected error occurred loading this issue."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c2c2c]"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/")}
          className="rounded-full border border-black/10 bg-white/80 px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] transition hover:bg-white"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
