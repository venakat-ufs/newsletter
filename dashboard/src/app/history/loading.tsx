export default function HistoryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="h-3 w-20 rounded bg-[#E5E7EB]" />
        <div className="mt-2 h-8 w-48 rounded-xl bg-[#E5E7EB]" />
      </div>
      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
        <div className="h-11 bg-[#F9FAFB] border-b border-[#E5E7EB]" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-6 border-b border-[#E5E7EB] px-6 py-4">
            <div className="h-4 w-8 rounded bg-[#E5E7EB]" />
            <div className="h-4 w-24 rounded bg-[#E5E7EB]" />
            <div className="h-4 w-20 rounded bg-[#E5E7EB]" />
            <div className="ml-auto h-4 w-16 rounded bg-[#E5E7EB]" />
            <div className="h-7 w-20 rounded-full bg-[#E5E7EB]" />
          </div>
        ))}
      </div>
    </div>
  );
}
