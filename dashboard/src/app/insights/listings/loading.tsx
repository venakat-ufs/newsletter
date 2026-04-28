export default function InsightsListingsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="h-3 w-24 rounded bg-[#E5E7EB]" />
        <div className="mt-2 h-8 w-56 rounded-xl bg-[#E5E7EB]" />
        <div className="mt-4 h-10 rounded-lg bg-[#E5E7EB]" />
      </div>
      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
        <div className="h-10 bg-[#F9FAFB] border-b border-[#E5E7EB]" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-[#E5E7EB] px-4 py-3">
            <div className="h-4 w-8 rounded bg-[#E5E7EB]" />
            <div className="h-4 w-24 rounded bg-[#E5E7EB]" />
            <div className="h-4 w-20 rounded bg-[#E5E7EB]" />
            <div className="ml-auto h-6 w-16 rounded-full bg-[#E5E7EB]" />
          </div>
        ))}
      </div>
    </div>
  );
}
