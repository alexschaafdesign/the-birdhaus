import type { NextConfig } from "next";
import { SONGHAUS_URL } from "./lib/site";

// Song Club became Songhaus (phase 3 cutover): every portal path on this app,
// on any host, 308s to the same path on Songhaus. Permanent, because these
// URLs live on in old emails, texts and flyers. /club predates /song-club,
// so it goes straight to Songhaus's /song-club in one hop. /api/club stays: Birdhaus's
// own header, login and photographer pages still call it.
const SONGHAUS_PATHS = 'song-club|w|yellow-ostrich|monica-marie';
function songhausRedirects() {
  return [
    { source: `/:seg(${SONGHAUS_PATHS})`, destination: `${SONGHAUS_URL}/:seg`, permanent: true },
    { source: `/:seg(${SONGHAUS_PATHS})/:rest*`, destination: `${SONGHAUS_URL}/:seg/:rest*`, permanent: true },
    { source: '/club', destination: `${SONGHAUS_URL}/song-club`, permanent: true },
    { source: '/club/:path*', destination: `${SONGHAUS_URL}/song-club/:path*`, permanent: true },
  ];
}

const nextConfig: NextConfig = {
  async redirects() {
    return [
      ...songhausRedirects(),
      // One page per night is /shows/BH-…; /archive is the index. Any casing
      // here — the show page itself 308s to the canonical spelling. Old slug
      // URLs (/shows/2025-03-29-caley-conway) redirect in the page, since that
      // needs the DB.
      { source: '/archive/:id([bB][hH]-[0-9][0-9a-zA-Z]*)', destination: '/shows/:id', permanent: true },
      // The 2027 archive preview's old home.
      { source: '/redesign/archive', destination: '/archive', permanent: true },
      { source: '/redesign/archive/:id', destination: '/shows/:id', permanent: true },
    ];
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
