import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { APP_NAME } from "@/lib/brand";

const publicSans = Public_Sans({ variable: "--font-public", subsets: ["latin"], display: "swap" });

const APP_DESCRIPTION = "Gestão do consultório odontológico: planos, orçamentos, agenda e financeiro.";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  metadataBase: new URL("https://app.smileosistema.com.br"),
  icons: {
    icon: [{ url: "/brand/smileos_icone_lavanda.svg", type: "image/svg+xml" }, { url: "/brand/icone-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/brand/icone-192.png",
  },
  openGraph: {
    type: "website",
    url: "https://app.smileosistema.com.br",
    siteName: APP_NAME,
    title: `${APP_NAME} — Gestão do consultório odontológico`,
    description: APP_DESCRIPTION,
    images: [{ url: "/brand/og-smileos-app.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Gestão do consultório odontológico`,
    description: APP_DESCRIPTION,
    images: ["/brand/og-smileos-app.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f4fa" }, { media: "(prefers-color-scheme: dark)", color: "#15121c" }],
  width: "device-width", initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${publicSans.variable} font-sans antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
