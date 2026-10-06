import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import NumberWheelGuard from "@/_shared/NumberWheelGuard";

export const metadata: Metadata = {
  title: "DFX GOLD",
  description: "DFX Solution Admin",
};

// Explicit fluid viewport so every module reflows to the device/window width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page render per request, which is what lets
  // Next stamp the CSP nonce from src/proxy.ts on its inline scripts.
  await headers();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Stops a stray scroll from rewriting a focused number field. */}
        <NumberWheelGuard />
        {children}
      </body>
    </html>
  );
}
