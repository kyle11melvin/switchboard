import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Served from this site instead of Google: no extra connections and nothing blocking the first paint.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], display: "swap", variable: "--font-fraunces" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Switchboard",
  description: "Ask once. Several AIs answer. Get one best answer.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Switchboard" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a1517", viewportFit: "cover" };

// Which override logos exist, read once at build time (see public/logos/README.md).
function ownLogos(): string {
  try { return readdirSync(join(process.cwd(), "public", "logos")).filter((f) => /\.(svg|png)$/i.test(f)).join(","); } catch { return ""; }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`} data-logos={ownLogos()}>
      <body>{children}</body>
    </html>
  );
}
