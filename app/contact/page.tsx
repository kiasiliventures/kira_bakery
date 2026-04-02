import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Find KiRA Bakery in Kira, Uganda and contact us by phone, email, WhatsApp, or Google Maps.",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  const address = "Kito village, Mamerito Mugerwa Road, Kira, Uganda";
  const mapQuery = "0.4017405,32.6518115 (KiRA Bakery)";
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=17&output=embed`;
  const directionsHref = "https://maps.app.goo.gl/4YwUSSHCy67GBYsG9";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <Card className="overflow-hidden">
        <div className="relative h-[320px]">
          <iframe
            src={mapSrc}
            title="KiRA Bakery location map"
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <p className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground">
            Find Us
          </p>
        </div>
        <CardHeader>
          <CardTitle className="font-serif text-3xl">Contact KiRA Bakery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-muted">
          <p className="font-medium text-foreground">KiRA Bakery</p>
          <p>{address}</p>
          <p>Phone: +256774624180</p>
          <p>Email: kirabakery@gmail.com</p>
          <Link
            href={directionsHref}
            target="_blank"
            rel="noreferrer"
            className="inline-block pt-2 text-sm font-medium text-accent underline underline-offset-4"
          >
            Open in Google Maps
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Reach Us Fast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href="tel:+256774624180">
            <Button className="w-full">Call Now</Button>
          </Link>
          <Link href="https://wa.me/256774624180" target="_blank" rel="noreferrer">
            <Button className="w-full" variant="outline">
              WhatsApp
            </Button>
          </Link>
          <p className="text-sm text-muted">
            We usually respond quickly on WhatsApp for cake and bulk orders.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
