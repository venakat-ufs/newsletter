import { Suspense } from "react";

import { SsoRedirectClient } from "./client";

function Spinner() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#F1F5F9",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          border: "4px solid #E2E8F0",
          borderTopColor: "#3B82F6",
          borderRadius: "50%",
          animation: "ufs-spin 0.75s linear infinite",
        }}
      />
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "#64748B",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Loading your insights…
      </p>
      <style>{`@keyframes ufs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SsoRedirectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SsoRedirectClient />
      <Spinner />
    </Suspense>
  );
}
