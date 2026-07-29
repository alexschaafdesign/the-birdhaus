import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

// Web app manifest — makes the site installable ("Add to Home Screen") and
// launch full-screen. start_url points at /admin so the installed icon opens
// straight into the admin, which is the whole point of installing it (quick
// reference during a show). The public site is still reachable from there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "BIRDHAUS",
    description: "the BIRDHAUS admin — shows, advances, and input needs.",
    start_url: "/admin",
    display: "standalone",
    background_color: "#2A2420",
    theme_color: "#2A2420",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
