import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  async headers() {
    return [
      {
        // Every single-segment page other than the root: the private family
        // links (and /dash). Keeps them out of search engines at the HTTP
        // layer and stops the secret path leaking through the Referer header.
        // The pattern reveals nothing: the keys themselves live only in the
        // FAMILY_KEYS environment variable.
        source: "/:slug([a-z0-9]+)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
