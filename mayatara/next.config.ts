import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable the X-Powered-By: Next.js header (don't advertise the stack)
  poweredByHeader: false,

  // pdfkit reads its font metrics (.afm) off disk at runtime, using a path
  // relative to its own module directory. Bundled into the route, that path
  // pointed at /ROOT/maytara/node_modules/pdfkit/js/data/Helvetica.afm, which
  // exists nowhere — so every compatibility PDF download 500'd in production.
  // Externalising it leaves a native require in place, and Next's file tracing
  // then ships the package's data files alongside the function.
  serverExternalPackages: ["pdfkit"],

  // Canonical host: send the apex to www, preserving the path.
  // Next anchors `has` values as ^value$, so this matches themayatara.com
  // exactly and never www.themayatara.com — no redirect loop.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "themayatara.com" }],
        destination: "https://www.themayatara.com/:path*",
        permanent: true,
      },
    ];
  },

  // Additional headers as fallback (middleware handles most)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control",   value: "on" },
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
        ],
      },
      {
        // Cache static assets aggressively, never cache API
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma",        value: "no-cache" },
          { key: "Expires",       value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;
