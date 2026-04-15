"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

function sanitizeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        setError(payload?.detail ?? "Sign-in failed.");
        return;
      }

      const nextPath = sanitizeNextPath(searchParams.get("next"));
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-5xl items-center justify-center">
      <div className="grid w-full gap-8 rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] backdrop-blur-xl md:grid-cols-[1.1fr_0.9fr] md:p-8">
        <div className="rounded-[28px] bg-[linear-gradient(145deg,#1a1a1a_0%,#2c2c2c_52%,#72262a_100%)] p-8 text-white shadow-[0_24px_64px_rgba(26,26,26,0.24)]">
          <p className="text-xs uppercase tracking-[0.28em] text-white/65">
            Editorial control room
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">
            Sign in to manage the weekly newsletter workflow.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/76">
            Review source pulls, approve drafts, publish articles, and schedule
            outbound campaigns from a single protected dashboard.
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-[28px] bg-white/70 p-6 ring-1 ring-[#ddd6cf]">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#7a6b60]">
              Secure access
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#1a1a1a]">
              Admin sign-in
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#65584d]">
              Use the admin credentials configured in the repo root `.env`.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#45372a]">
                Username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full rounded-2xl border border-[#d7cfc8] bg-white px-4 py-3 text-sm text-[#17161d] outline-none transition focus:border-[#72262a] focus:ring-2 focus:ring-[#f3e7e8]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#45372a]">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-2xl border border-[#d7cfc8] bg-white px-4 py-3 text-sm text-[#17161d] outline-none transition focus:border-[#72262a] focus:ring-2 focus:ring-[#f3e7e8]"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-[#e6b8b2] bg-[#fff1ef] px-4 py-3 text-sm text-[#8a3c2f]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#72262a] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(26,26,26,0.14)] transition hover:translate-y-[-1px] hover:bg-[#5a1e1f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
