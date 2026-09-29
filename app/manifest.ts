import type { MetadataRoute } from "next";

// What the phone uses when Switchboard is added to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Switchboard",
    short_name: "Switchboard",
    description: "One idea, every AI, one verdict.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1517",
    theme_color: "#0a1517",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
