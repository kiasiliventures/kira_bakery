"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MenuErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MenuError({ error, reset }: MenuErrorProps) {
  useEffect(() => {
    console.error("menu_route_failed", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Menu</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-serif">We could not load the bakery menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-muted">
            The catalog is taking longer than expected or is temporarily unavailable. You can retry
            now, or head back to the home page and try again in a moment.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={reset}>
              Retry
            </Button>
            <Link href="/">
              <Button type="button" variant="outline">
                Back Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
