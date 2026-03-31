import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 text-sm text-muted md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-2">
          <p>KiRA Bakery, Kito village, Mamerito Mugerwa Road, Kira.</p>
          <p>Since 2020.</p>
        </div>
        <nav
          aria-label="Footer legal links"
          className="flex flex-wrap gap-x-5 gap-y-2 md:justify-end"
        >
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground"
          >
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
