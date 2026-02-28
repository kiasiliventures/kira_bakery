import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <Card className="overflow-hidden">
        <div className="relative h-[320px]">
          <Image
            src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80"
            alt="Bakery interior map placeholder"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/25" />
          <p className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold">
            Map Placeholder
          </p>
        </div>
        <CardHeader>
          <CardTitle className="font-serif text-3xl">Contact KiRA Bakery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[#5f4637]">
          <p className="font-medium text-[#2D1F16]">KiRA Bakery</p>
          <p>Kito village, Mamerito Mugerwa Road, Kira</p>
          <p>Phone: +256774624180</p>
          <p>Email: kirabakery@gmail.com</p>
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
          <p className="text-sm text-[#5f4637]">
            We usually respond quickly on WhatsApp for cake and bulk orders.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

