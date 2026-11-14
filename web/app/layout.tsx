import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { APP_NAME } from "@/lib/brand";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Gestão do consultório odontológico: planos, orçamentos, agenda e financeiro.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/smileos_icone_lavanda.svg", type: "image/svg+xml" }, { url: "/brand/icone-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/brand/icone-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#1f1b2e" }],
  width: "device-width", initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${jakarta.variable} font-sans antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
