import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Song Club portal moved from /club to /song-club. Redirect old links
  // (bookmarks, already-sent invite emails) to the new home.
  async redirects() {
    return [
      { source: '/club', destination: '/song-club', permanent: true },
      { source: '/club/:path*', destination: '/song-club/:path*', permanent: true },
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
