type LegalDocumentSection = {
  body: string[];
  title: string;
};

type LegalDocumentPageProps = {
  description: string;
  lastUpdated: string;
  sections: LegalDocumentSection[];
  title: string;
};

export function LegalDocumentPage({
  description,
  lastUpdated,
  sections,
  title,
}: LegalDocumentPageProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-[0.22em] text-badge-foreground">
          Public Legal Page
        </p>
        <h1 className="font-serif text-4xl text-foreground sm:text-5xl">{title}</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">{description}</p>
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          Last updated: {lastUpdated}
        </p>
      </header>

      <div className="space-y-8 rounded-[32px] border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="font-serif text-2xl text-foreground">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-7 text-muted sm:text-base">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
