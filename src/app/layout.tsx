import type { Metadata } from "next";
import { Golos_Text, Inter } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import "./globals.css";

const golosText = Golos_Text({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DFX Solution — Jewellery Relationship Operating System",
  description: "White Label Multi-Tenant SaaS Platform for Jewellery Businesses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${golosText.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-[#ECEEF7] text-slate font-body">
        <ErrorBoundary>
          <AuthProvider>
            <main className="min-h-screen">{children}</main>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
