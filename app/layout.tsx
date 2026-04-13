import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileCartBar } from "@/components/mobile-cart-bar";
import { PortraitOrientationHint } from "@/components/portrait-orientation-hint";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/components/providers/app-provider";
import { PwaRegister } from "@/components/pwa-register";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { getAbsoluteUrl, getSiteUrl } from "@/lib/site";
import "./globals.css";

const themeScript = `
  (() => {
    try {
      const storedTheme = window.localStorage.getItem("kira.theme");
      const resolvedTheme =
        storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;

      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute(
          "content",
          resolvedTheme === "dark" ? "#171311" : "#f5e6d3",
        );
      }
    } catch {}
  })();
`;

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "KiRA Bakery | Freshly Baked Everyday in Kira, Uganda",
    template: "%s | KiRA Bakery",
  },
  description:
    "Order fresh bread, cakes, pastries, yoghurt, and bakery treats from KiRA Bakery in Kira, Uganda.",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_UG",
    url: "/",
    siteName: "KiRA Bakery",
    title: "KiRA Bakery | Freshly Baked Everyday in Kira, Uganda",
    description:
      "Order fresh bread, cakes, pastries, yoghurt, and bakery treats from KiRA Bakery in Kira, Uganda.",
    images: [
      {
        url: getAbsoluteUrl("/images/hero_image_3.jpg"),
        width: 1600,
        height: 1067,
        alt: "Fresh bread and pastries from KiRA Bakery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "KiRA Bakery | Freshly Baked Everyday in Kira, Uganda",
    description:
      "Order fresh bread, cakes, pastries, yoghurt, and bakery treats from KiRA Bakery in Kira, Uganda.",
    images: [getAbsoluteUrl("/images/hero_image_3.jpg")],
  },
  appleWebApp: {
    capable: true,
    title: "KiRA Bakery",
    statusBarStyle: "default",
  },
  icons: {
    shortcut: "/icon.png",
    apple: "/icon.png",
    icon: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5e6d3" },
    { media: "(prefers-color-scheme: dark)", color: "#171311" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#f5e6d3" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PostHogProvider>
          <AuthProvider>
            <AppProvider>
              <PwaRegister />
              <PortraitOrientationHint />
              <SiteHeader />
              <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-28 lg:pb-8">{children}</main>
              <MobileCartBar />
              <SiteFooter />
              <Analytics />
              <SpeedInsights />
            </AppProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
