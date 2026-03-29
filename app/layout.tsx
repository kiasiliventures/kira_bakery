import type { Metadata, Viewport } from "next";
import { Noto_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { PortraitOrientationHint } from "@/components/portrait-orientation-hint";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/components/providers/app-provider";
import { PwaRegister } from "@/components/pwa-register";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
});

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
  title: "KiRA Bakery",
  description: "Freshly Baked Everyday",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KiRA Bakery",
    statusBarStyle: "default",
  },
  icons: {
    shortcut: [
      {
        url: "/icon.png",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
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
    <html lang="en" suppressHydrationWarning className={notoSerif.variable}>
      <head>
        <meta name="theme-color" content="#f5e6d3" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AuthProvider>
          <AppProvider>
            <PwaRegister />
            <PortraitOrientationHint />
            <SiteHeader />
            <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
            <SiteFooter />
            <Analytics />
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
