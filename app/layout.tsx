import type { Metadata, Viewport } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    // Per-page titles render as "Show name · the BIRDHAUS".
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  // Installed-PWA behavior on iOS: launch full-screen (no Safari chrome) and
  // give the home-screen entry its own title.
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  // Disco-ball favicon set (public/). The web manifest stays app/manifest.ts
  // (installed app opens /admin); it points at public/icon-192/512.png.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Paper, the 2027 page ground (surface/paper, the same colour as <html> below),
// so mobile browser chrome blends into the page.
export const viewport: Viewport = {
  themeColor: "#F0EDE4",
};

// Every page renders per request. This used to follow from the old header's
// admin-cookie read here; that's gone, so it's stated outright. Caching the
// pages that could be is a post-launch item.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // <html> takes surface/paper and surface/ink (app/redesign/tokens.css), the
  // ground SiteFrame paints, so overscroll and short pages match it. Literal,
  // so it holds before any CSS loads.
  return (
    <html lang="en" style={{ backgroundColor: "#F0EDE4", color: "#16150F" }}>
      <body className={`${instrumentSans.variable} ${plexMono.variable}`} style={{ color: "#16150F" }}>
        {children}
      </body>
    </html>
  );
}