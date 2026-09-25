import type { NextConfig } from "next";

// Mayatara (Pulse/Events/Match) used to live under /mayatara/* as a
// separately-branded product. These are permanent, one-time URL moves as
// part of merging it into OppIDX as one product — not aliases, so
// `permanent: true` throughout to consolidate any existing inbound links.
const nextConfig: NextConfig = {
  // pdfkit reads its built-in AFM font metrics off disk at runtime
  // (node_modules/pdfkit/js/data/Helvetica.afm). Bundled into a server chunk
  // that path gets rewritten to a '/ROOT/...' location that doesn't exist, so
  // every /api/match/report/pdf request died with ENOENT before writing a
  // byte. Opting the package out of Server Components bundling makes it a
  // native require() that resolves its own data files. pdfkit is not on
  // Next's auto-externalized list.
  serverExternalPackages: ['pdfkit'],
  images: {
    // The same-origin gateway may have a dynamic image URL, and the committed
    // wordmark is the one additional local image the header may optimize.
    // The gateway validates its `url` parameter (including every redirect)
    // before it fetches anything, so this is not a general local-image wildcard.
    localPatterns: [{ pathname: '/api/images' }, { pathname: '/logo.png' }],
  },
  async redirects() {
    return [
      // /philosophy → /manifesto: same writing, reordered so the Chaser
      // identity leads, plus a share card and a real nav slot. Declared here
      // rather than as a page calling permanentRedirect() because a page-level
      // redirect resolves inside the streaming render, where Next can only
      // emit a client-side <meta http-equiv="refresh"> on a 200 response —
      // verified against a production build. A config redirect is a genuine
      // 308 with a Location header, which is what an indexed URL needs.
      { source: "/philosophy", destination: "/manifesto", permanent: true },

      // The public daily-digest archive is retired. Nobody read it, and the
      // one genuinely useful thing on it — the board-growth chart — moved to
      // the owner's console (see BoardGrowthChart in AdminPanel). The
      // DailyDigest rows are still written nightly and still feed that
      // chart; only the public surface is gone.
      //
      // Not `permanent`: this is a product decision rather than a URL
      // rename, and these URLs were shared into Telegram/Discord, so a 308
      // that browsers cache forever would be the harder thing to walk back.
      { source: "/newsletter", destination: "/", permanent: false },
      { source: "/newsletter/:date", destination: "/", permanent: false },

      // That product now lives on its own domain. A 308 to its root hands the
      // signals this URL accumulated to the new site rather than discarding
      // them, which a 404 would, and which a redirect to the OppIDX homepage
      // would too (Google reads a removed page pointed at an unrelated
      // destination as a soft 404).
      //
      // Root to root deliberately: the sub-paths below still resolve to real
      // OppIDX features, and pointing them at a URL structure on the new
      // domain that may not exist yet would trade a working redirect for a
      // broken one.
      { source: "/mayatara", destination: "https://themayatara.com", permanent: true },

      { source: "/mayatara/events", destination: "/resources", permanent: true },
      { source: "/mayatara/events/new", destination: "/events/new", permanent: true },
      { source: "/mayatara/events/:slug/manage", destination: "/events/:slug/manage", permanent: true },
      { source: "/mayatara/events/:slug", destination: "/events/:slug", permanent: true },
      { source: "/mayatara/pulse/digest/:period", destination: "/pulse/digest/:period", permanent: true },
      { source: "/mayatara/pulse", destination: "/pulse", permanent: true },
      { source: "/mayatara/interview", destination: "/match/interview", permanent: true },
      { source: "/mayatara/compatibility", destination: "/match/compatibility", permanent: true },
      { source: "/mayatara/philosophy", destination: "/match/philosophy", permanent: true },
      { source: "/mayatara/terms", destination: "/match/terms", permanent: true },
      { source: "/mayatara/match", destination: "/", permanent: true },
      { source: "/mayatara/login", destination: "/account", permanent: true },
      { source: "/mayatara/register", destination: "/account/register", permanent: true },
      { source: "/mayatara/dashboard", destination: "/account/dashboard", permanent: true },
      // API-path redirects — defense in depth for any external caller of the
      // old endpoints this diff didn't already fix directly (e.g. the two
      // GitHub Actions cron workflows, updated to call the new URLs
      // directly since a 308 only helps a client that follows redirects on
      // its own, which `curl` without `-L` does not).
      { source: "/api/mayatara/events/:path*", destination: "/api/events/:path*", permanent: true },
      { source: "/api/mayatara/pulse/:path*", destination: "/api/pulse/live/:path*", permanent: true },
      { source: "/api/mayatara/auth/:path*", destination: "/api/match/auth/:path*", permanent: true },
      { source: "/api/mayatara/match/:path*", destination: "/api/match/:path*", permanent: true },
      { source: "/api/mayatara/interview", destination: "/api/match/interview", permanent: true },
      { source: "/api/mayatara/compatibility/:path*", destination: "/api/match/compatibility/:path*", permanent: true },
      { source: "/api/mayatara/profile/:path*", destination: "/api/match/profile/:path*", permanent: true },
      { source: "/api/mayatara/feedback", destination: "/api/match/feedback", permanent: true },
      { source: "/api/mayatara/report/:path*", destination: "/api/match/report/:path*", permanent: true },

      // Match has no standalone "come explore it" hub — matching runs
      // automatically (Friday cron + chasingCohort) and the only front-end
      // surface is the "Find your person" action embedded on opportunity
      // pages (see EcosystemActions). Not `permanent` — this is a product
      // decision, not a URL rename, and easier to reverse if it changes.
      { source: "/match", destination: "/", permanent: false },

      // Same reasoning for Events: no standalone browse page (often just an
      // empty calendar) — gatherings now live inside /resources. Individual
      // event pages (/events/[slug], /events/new, /events/[slug]/manage)
      // are unaffected, only the bare index redirects.
      { source: "/events", destination: "/resources", permanent: false },
    ];
  },
};

export default nextConfig;
