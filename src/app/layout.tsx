import type { Metadata, Viewport } from "next";
import "./globals.css";
import NumberWheelGuard from "@/_shared/NumberWheelGuard";

export const metadata: Metadata = {
  title: "DFX Solution — Admin",
  description: "DFX Solution Admin",
};

// Explicit fluid viewport so every module reflows to the device/window width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
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
