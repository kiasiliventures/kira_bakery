import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Classes Coming Soon",
  description:
    "KiRA Bakery baking classes are coming soon.",
  alternates: {
    canonical: "/classes",
  },
};

export default function ClassesPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-2xl border-dashed">
        <CardHeader className="space-y-3 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
            KiRA Bakery
          </p>
          <CardTitle className="font-serif text-4xl text-foreground">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent className="pb-8 text-center text-muted">
          Baking classes are not available yet. We&apos;re preparing something special and will
          share details here soon.
        </CardContent>
      </Card>
    </div>
  );
}
