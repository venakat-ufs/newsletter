export default function DataLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-[#E5E7EB]" />
            <div className="h-7 w-40 rounded-xl bg-[#E5E7EB]" />
          </div>
          <div className="h-9 w-28 rounded-lg bg-[#E5E7EB]" />
        </div>
        {/* Status dots */}
        <div className="mt-4 flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-20 rounded-full bg-[#E5E7EB]" />
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="h-3 w-20 rounded bg-[#E5E7EB]" />
            <div className="mt-2 h-8 w-28 rounded bg-[#E5E7EB]" />
            <div className="mt-2 h-3 w-32 rounded bg-[#E5E7EB]" />
          </div>
        ))}
      </div>

      {/* Panel cards */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-[#E5E7EB]" />
              <div className="h-6 w-48 rounded-xl bg-[#E5E7EB]" />
            </div>
            <div className="h-6 w-20 rounded-full bg-[#E5E7EB]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-20 rounded-lg bg-[#F3F4F6]" />
            ))}
          </div>
          <div className="mt-3 h-40 rounded-lg bg-[#F3F4F6]" />
        </div>
      ))}
    </div>
  );
}
