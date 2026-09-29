import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Switchboard",
  description: "One idea, every AI, one verdict.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1622" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
