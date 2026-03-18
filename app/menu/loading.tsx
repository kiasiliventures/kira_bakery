export default function MenuLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-10 w-40 animate-pulse rounded-xl bg-surface-alt" />
        <div className="h-5 w-full max-w-2xl animate-pulse rounded-lg bg-surface-alt" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-11 w-28 animate-pulse rounded-xl bg-surface-alt"
          />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
          >
            <div className="h-52 animate-pulse bg-surface-alt" />
            <div className="space-y-4 p-6">
              <div className="h-6 w-2/3 animate-pulse rounded-lg bg-surface-alt" />
              <div className="h-4 w-full animate-pulse rounded-lg bg-surface-alt" />
              <div className="h-4 w-5/6 animate-pulse rounded-lg bg-surface-alt" />
              <div className="h-5 w-24 animate-pulse rounded-lg bg-surface-alt" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-surface-alt" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
