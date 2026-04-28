export default function DraftEditorLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header card */}
      <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] sm:p-8">
        <div className="h-8 w-24 rounded-full bg-[#E5E7EB]" />
        <div className="mt-5 space-y-3">
          <div className="h-3 w-28 rounded bg-[#E5E7EB]" />
          <div className="h-9 w-48 rounded-xl bg-[#E5E7EB]" />
          <div className="h-4 w-80 rounded bg-[#E5E7EB]" />
        </div>
        <div className="mt-6 grid gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-3xl bg-[#F3F4F6]" />
          ))}
        </div>
      </div>

      {/* Source section */}
      <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="h-3 w-20 rounded bg-[#E5E7EB]" />
            <div className="h-7 w-64 rounded-xl bg-[#E5E7EB]" />
            <div className="h-4 w-full rounded bg-[#E5E7EB]" />
            <div className="flex gap-2">
              <div className="h-8 w-36 rounded-full bg-[#E5E7EB]" />
              <div className="h-8 w-40 rounded-full bg-[#E5E7EB]" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-[18px] bg-[#F3F4F6]" />
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-3 w-24 rounded bg-[#E5E7EB]" />
            <div className="h-7 w-56 rounded-xl bg-[#E5E7EB]" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-11 rounded-xl bg-[#E5E7EB]" />
              <div className="h-11 rounded-xl bg-[#E5E7EB]" />
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-[18px] bg-[#F3F4F6]" />
            ))}
          </div>
        </div>
      </div>

      {/* Draft section */}
      <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(26,26,26,0.10)] sm:p-8">
        <div className="h-3 w-16 rounded bg-[#E5E7EB]" />
        <div className="mt-3 h-7 w-56 rounded-xl bg-[#E5E7EB]" />
        <div className="mt-6 h-40 rounded-[24px] bg-[#F3F4F6]" />
      </div>
    </div>
  );
}
