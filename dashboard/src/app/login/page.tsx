"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

function sanitizeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

function UnitedLogo() {
  return (
    <Image src="/logo.jpeg" alt="United Field Services" width={160} height={80} style={{ objectFit: "contain" }} />
  );
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
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] px-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm md:grid-cols-[1fr_1fr]">
        {/* Left panel */}
        <div className="bg-[#1C1C1E] p-10 text-white flex flex-col justify-between">
          <div className="inline-block rounded-xl bg-white p-2">
            <UnitedLogo />
          </div>

          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Operations Portal
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-snug text-white">
              Manage your newsletter workflow end to end.
            </h1>
            <p className="mt-4 text-sm leading-7 text-white/55">
              Review source pulls, approve drafts, and schedule outbound campaigns from a single protected dashboard.
            </p>
          </div>

          <div className="mt-12 text-xs text-white/25">
            © 2026 United Field Services
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex flex-col justify-center p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]">
            Secure access
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[#111827]">
            Sign in
          </h2>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[#374151]">
                Username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full rounded-lg border border-[#D1D5DB] bg-white px-4 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[#374151]">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-[#D1D5DB] bg-white px-4 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
              />
            </label>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
