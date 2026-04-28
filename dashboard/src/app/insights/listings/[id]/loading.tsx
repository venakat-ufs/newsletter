export default function IssueInsightsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header with KPI strip and tab bar */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-36 rounded bg-[#E5E7EB]" />
            <div className="h-7 w-56 rounded-xl bg-[#E5E7EB]" />
            <div className="h-3 w-80 rounded bg-[#E5E7EB]" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-lg bg-[#E5E7EB]" />
            <div className="h-9 w-24 rounded-lg bg-[#E5E7EB]" />
          </div>
        </div>
        {/* KPI strip */}
        <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
              <div className="h-2.5 w-20 rounded bg-[#E5E7EB]" />
              <div className="mt-2 h-6 w-16 rounded bg-[#E5E7EB]" />
              <div className="mt-1 h-2.5 w-24 rounded bg-[#E5E7EB]" />
            </div>
          ))}
        </div>
        {/* Tab bar */}
        <div className="mt-5 flex gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={`h-7 rounded-full bg-[#E5E7EB] ${i === 0 ? "w-20" : "w-16"}`} />
          ))}
        </div>
        {/* Filter row */}
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-[#E5E7EB]" />
          ))}
        </div>
      </div>

      {/* Overview grid skeleton */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-[#F3F4F6]" />
          ))}
        </div>
      </div>
    </div>
  );
}
