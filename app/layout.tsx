import type { Metadata, Viewport } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { GlobalPlayerProvider } from "@/components/player/GlobalPlayer";
import PlayerBar from "@/components/player/PlayerBar";
import { isAdminSession } from "@/lib/admin-session";
import { onPortalHost } from "@/lib/portal-host";
import PortalShell from "@/components/portal/PortalShell";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  PORTAL_URL,
  PORTAL_SITE_NAME,
  PORTAL_DESCRIPTION,
} from "@/lib/site";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex-mono",
});

const birdhausMetadata: Metadata = {
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

// The portal host's identity. Icons and the web manifest come from host
// rewrites in next.config.ts, so the main site's static icon routes stay as-is.
const portalMetadata: Metadata = {
  metadataBase: new URL(PORTAL_URL),
  title: {
    default: PORTAL_SITE_NAME,
    template: `%s · ${PORTAL_SITE_NAME}`,
  },
  description: PORTAL_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: PORTAL_SITE_NAME,
    title: PORTAL_SITE_NAME,
    description: PORTAL_DESCRIPTION,
    url: PORTAL_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: PORTAL_SITE_NAME,
    description: PORTAL_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: PORTAL_SITE_NAME,
    statusBarStyle: "black-translucent",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return (await onPortalHost()) ? portalMetadata : birdhausMetadata;
}

// The portal (Fresh Cuts) hasn't been through the 2027 redesign: its pages
// still use main's light-on-dark text, so the portal host keeps main's dark
// page colors instead of this branch's paper/ink.
const PORTAL_PAGE_COLORS = { backgroundColor: "#2A2420", color: "#E8E0D0" };

// Ink, matching the dark logo band at the top of every page.
export const viewport: Viewport = {
  themeColor: "#1A1712",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page already renders per request (isAdminSession reads cookies), so
  // the host check adds no dynamism. Portal host → Fresh Cuts shell.
  const [isAdmin, portal] = await Promise.all([isAdminSession(), onPortalHost()]);

  return (
    <html lang="en" style={portal ? PORTAL_PAGE_COLORS : { backgroundColor: "#F2EEE3", color: "#1A1712" }}>
      <body
        className={`${instrumentSans.variable} ${plexMono.variable}`}
        style={{ color: portal ? PORTAL_PAGE_COLORS.color : "#1A1712" }}
      >
        {/* The provider lives at the root so audio keeps playing across
            client-side navigation; the bar pins to the bottom of every page
            while a track is loaded. */}
        <GlobalPlayerProvider>
          {portal ? (
            <PortalShell>{children}</PortalShell>
          ) : (
            <>
              <Header isAdmin={isAdmin} />
              {children}
            </>
          )}
          <PlayerBar />
        </GlobalPlayerProvider>
      </body>
    </html>
  );
}