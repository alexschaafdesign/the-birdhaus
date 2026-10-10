import type { NextConfig } from "next";
import { SITE_URL, PORTAL_URL, PORTAL_SPLIT } from "./lib/site";

// Domain split: the portal (Song Club, /w workspaces, their vanity paths) is
// served by this same app on its own host. Emitted only when
// NEXT_PUBLIC_PORTAL_URL names a distinct host (Production), so localhost and
// previews get no host rules. These live here rather than in proxy.ts because
// Next relativizes a middleware redirect whose host matches request.url — off
// Vercel that's the server's own hostname, which turned the portal→main bounce
// into a same-host loop. `has: host` compares hostnames without the port.
const PORTAL_PAGES = 'song-club|w|yellow-ostrich|monica-marie';
// Also served on the portal host: shared login/account pages and every API
// route (each authorizes itself; staff POST /api/admin/uploads from inside the
// portal). `_` covers /_next and dev internals.
const PORTAL_HOST_ALSO = 'login|account|api|_';

function portalSplitRedirects() {
  if (!PORTAL_SPLIT) return [];
  // Match both the bare and www hostnames, whichever SITE_URL uses (www today;
  // Vercel 307s the bare domain to it, but a request can still arrive bare).
  const bareSiteHost = new URL(SITE_URL).hostname.replace(/^www\./, '');
  const portalHost = new URL(PORTAL_URL).hostname;
  const toPortal = [bareSiteHost, `www.${bareSiteHost}`].flatMap((host) => [
    {
      source: `/:seg(${PORTAL_PAGES})`,
      has: [{ type: 'host' as const, value: host }],
      destination: `${PORTAL_URL}/:seg`,
      permanent: true,
    },
    {
      source: `/:seg(${PORTAL_PAGES})/:rest*`,
      has: [{ type: 'host' as const, value: host }],
      destination: `${PORTAL_URL}/:seg/:rest*`,
      permanent: true,
    },
  ]);
  // Every other page on the portal host goes back to the main site. Skips `/`
  // (rewritten to the Song Club home below) and files with an extension
  // (robots.txt, sitemap.xml, icons, public/ images).
  const toMain = {
    source: `/:path((?!(?:${PORTAL_PAGES}|${PORTAL_HOST_ALSO})(?:/|$))(?!.*\\.[^/]+$).+)`,
    has: [{ type: 'host' as const, value: portalHost }],
    destination: `${SITE_URL}/:path`,
    permanent: true,
  };
  return [...toPortal, toMain];
}

function portalSplitRewrites() {
  if (!PORTAL_SPLIT) return [];
  const portalHost = new URL(PORTAL_URL).hostname;
  const onPortal = [{ type: 'host' as const, value: portalHost }];
  return [
    { source: '/', has: onPortal, destination: '/song-club' },
    // Song Club icons + manifest (public/portal/) in place of the Birdhaus
    // ones, which stay static app routes on the main host.
    { source: '/favicon.ico', has: onPortal, destination: '/portal/favicon-48.png' },
    { source: '/icon.png', has: onPortal, destination: '/portal/icon-32.png' },
    { source: '/apple-icon.png', has: onPortal, destination: '/portal/apple-icon.png' },
    // The main site's disco-ball set adds these paths; keep them Song Club on
    // the portal too (iOS requests /apple-touch-icon.png even without a tag).
    { source: '/favicon-16x16.png', has: onPortal, destination: '/portal/icon-32.png' },
    { source: '/favicon-32x32.png', has: onPortal, destination: '/portal/icon-32.png' },
    { source: '/apple-touch-icon.png', has: onPortal, destination: '/portal/apple-icon.png' },
    { source: '/manifest.webmanifest', has: onPortal, destination: '/portal/manifest.webmanifest' },
  ];
}

const nextConfig: NextConfig = {
  // The Song Club portal moved from /club to /song-club. Redirect old links
  // (bookmarks, already-sent invite emails) to the new home.
  async redirects() {
    return [
      { source: '/club', destination: '/song-club', permanent: true },
      { source: '/club/:path*', destination: '/song-club/:path*', permanent: true },
      ...portalSplitRedirects(),
    ];
  },
  async rewrites() {
    return { beforeFiles: portalSplitRewrites(), afterFiles: [], fallback: [] };
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        // Birdhaus's own R2 bucket: flyers and (Twin Scene-synced) band photos.
        protocol: "https",
        hostname: "images.thebirdhaus.org",
      },
    ],
  },
};

export default nextConfig;
