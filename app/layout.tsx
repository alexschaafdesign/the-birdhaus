import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AdminBanner from "@/components/AdminBanner";
import { isAdminSession } from "@/lib/admin-session";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
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

export const viewport: Viewport = {
  themeColor: "#2A2420",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isAdmin = await isAdminSession();

  return (
    <html lang="en" style={{ backgroundColor: "#2A2420", color: "#E8E0D0" }}>
      <body className={instrumentSans.className} style={{ backgroundColor: "#2A2420", color: "#E8E0D0" }}>
        <AdminBanner isAdmin={isAdmin} />
        <Header />
        {children}
      </body>
    </html>
  );
}