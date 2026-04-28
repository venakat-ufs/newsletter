export default function ReoLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="h-3 w-16 rounded bg-[#E5E7EB]" />
        <div className="mt-2 h-8 w-64 rounded-xl bg-[#E5E7EB]" />
        <div className="mt-2 h-3 w-80 rounded bg-[#E5E7EB]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="h-3 w-20 rounded bg-[#E5E7EB]" />
            <div className="mt-2 h-8 w-28 rounded bg-[#E5E7EB]" />
            <div className="mt-2 h-3 w-24 rounded bg-[#E5E7EB]" />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="h-5 w-40 rounded bg-[#E5E7EB]" />
          <div className="mt-3 h-32 rounded-lg bg-[#F3F4F6]" />
        </div>
      ))}
    </div>
  );
}
