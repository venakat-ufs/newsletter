export default function RootLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-[#E5E7EB]" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="h-3 w-24 rounded bg-[#E5E7EB]" />
            <div className="mt-3 h-8 w-32 rounded bg-[#E5E7EB]" />
            <div className="mt-2 h-3 w-40 rounded bg-[#E5E7EB]" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="h-4 w-36 rounded bg-[#E5E7EB]" />
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-[#F3F4F6]" />
          ))}
        </div>
      </div>
    </div>
  );
}
