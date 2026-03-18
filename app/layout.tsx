import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { AppProvider } from "@/components/providers/app-provider";
import { PwaRegister } from "@/components/pwa-register";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
  title: "KiRA Bakery",
  description: "Delicious baked fresh daily in Kira, Uganda.",
  manifest: "/manifest.webmanifest",
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
        <AppProvider>
          <PwaRegister />
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
          <SiteFooter />
          <Analytics />
        </AppProvider>
      </body>
    </html>
  );
}
