import type { Metadata, Viewport } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { GlobalPlayerProvider } from "@/components/player/GlobalPlayer";
import PlayerBar from "@/components/player/PlayerBar";
import { isAdminSession } from "@/lib/admin-session";
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
};

// Ink, matching the dark logo band at the top of every page.
export const viewport: Viewport = {
  themeColor: "#1A1712",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isAdmin = await isAdminSession();

  return (
    <html lang="en" style={{ backgroundColor: "#F2EEE3", color: "#1A1712" }}>
      <body className={`${instrumentSans.variable} ${plexMono.variable}`} style={{ color: "#1A1712" }}>
        {/* The provider lives at the root so audio keeps playing across
            client-side navigation; the bar pins to the bottom of every page
            while a track is loaded. */}
        <GlobalPlayerProvider>
          <Header isAdmin={isAdmin} />
          {children}
          <PlayerBar />
        </GlobalPlayerProvider>
      </body>
    </html>
  );
}