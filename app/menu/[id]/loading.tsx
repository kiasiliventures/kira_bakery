export default function ProductDetailLoading() {
  return (
    <section className="grid gap-8 lg:grid-cols-2" aria-busy="true" aria-live="polite">
      <div className="h-[360px] animate-pulse rounded-2xl bg-surface-alt md:h-[480px]" />
      <div className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
        <div className="h-4 w-24 animate-pulse rounded-lg bg-surface-alt" />
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface-alt" />
        <div className="h-5 w-full animate-pulse rounded-lg bg-surface-alt" />
        <div className="h-5 w-5/6 animate-pulse rounded-lg bg-surface-alt" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-surface-alt" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-surface-alt" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-surface-alt" />
      </div>
    </section>
  );
}
