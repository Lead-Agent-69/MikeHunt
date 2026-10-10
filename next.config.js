const { withSentryConfig } = require("@sentry/nextjs");

function supabaseConnectSources() {
  const sources = new Set(["'self'", "https:", "wss:"]);
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      sources.add(url.origin);
      if (url.protocol === "http:") {
        sources.add(`ws://${url.host}`);
      }
      if (url.protocol === "https:") {
        sources.add(`wss://${url.host}`);
      }
    } catch {
      // Invalid/template envs are handled by runtime readiness checks.
    }
  }
  if (process.env.NODE_ENV !== "production") {
    sources.add("http://127.0.0.1:54321");
    sources.add("ws://127.0.0.1:54321");
    sources.add("http://localhost:54321");
    sources.add("ws://localhost:54321");
  }
  return Array.from(sources).join(" ");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: false,
  output: "standalone",
  // Pin the workspace root to THIS directory. A stray package-lock.json under the user home
  // can make Next infer the home folder as the workspace root (multiple-lockfiles warning) and,
  // with output:'standalone', try to file-trace far too much into the server bundle.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  transpilePackages: ["@supabase/supabase-js"],
  serverExternalPackages: [
    "playwright",
    "playwright-extra",
    "patchright",
    "puppeteer-extra-plugin-stealth",
    "bull",
    "bullmq",
    "ioredis",
    // @supabase/realtime-js loads this dynamically on Node. Keeping it external makes Vercel
    // include the direct runtime dependency instead of leaving a require("ws") in a traced chunk.
    "ws",
  ],
  outputFileTracingIncludes: {
    // Supabase Realtime selects its Node WebSocket transport dynamically. Turbopack leaves the
    // require external, so explicitly trace the package into every server function that may
    // construct a Supabase client (including /api/system/status on Vercel).
    "/*": ["./node_modules/ws/**/*"],
    // patchright-core reads browsers.json at module-init time. It is in serverExternalPackages
    // so Next/Turbopack never traces it automatically. Scope this to the one route that imports
    // patchright-engine to avoid bloating every other Lambda with browser-related JSON.
    "/api/deal-check": ["./node_modules/patchright-core/**/*"],
  },
  // Scraping runs on GitHub Actions, not Vercel serverless. Keep heavy browser/scraper
  // packages external so the Next build never tries to bundle Chromium into functions.

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.copart.com" },
      { protocol: "https", hostname: "cs.copart.com" },
      { protocol: "https", hostname: "iaai-img-web.azureedge.net" },
      { protocol: "https", hostname: "*.craigslist.org" },
      { protocol: "https", hostname: "i.ebayimg.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      { protocol: "https", hostname: "media.ed.edmunds-media.com" },
      { protocol: "https", hostname: "vehicle-photos.carmax.com" },
      { protocol: "https", hostname: "*.cargurus.com" },
      { protocol: "https", hostname: "*.autotrader.com" },
      { protocol: "https", hostname: "*.carvana.io" },
      { protocol: "https", hostname: "*.vroomcdn.com" },
      { protocol: "https", hostname: "*.truecar.com" },
      { protocol: "https", hostname: "*.offerupnow.com" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  async redirects() {
    return [
      { source: "/deals", destination: "/scan", permanent: false },
      { source: "/scanner", destination: "/scan", permanent: false },
      { source: "/syndicate", destination: "/fleet", permanent: false },
      { source: "/list", destination: "/fleet", permanent: false },
      { source: "/finance", destination: "/fleet", permanent: false },
      { source: "/bulk", destination: "/scan", permanent: false },
      { source: "/watchlist", destination: "/fleet", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // D4: permissive on script/style/img (Next inline bootstrap + scraped https images) to
            // avoid breakage, strict on the high-value XSS / clickjacking / injection directives.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
              "style-src 'self' 'unsafe-inline' https:",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' blob: https:",
              "font-src 'self' data: https:",
              `connect-src ${supabaseConnectSources()}`,
              "frame-src 'self' https://*.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Sentry Next.js wrapper. This was imported at the top of the file but NEVER applied, so the
// plugin's Next-specific work (release injection, source-map resolution, SDK config wiring) was
// silently skipped while sentry.server/edge/instrumentation files did load. Applying it here
// matches what @sentry/nextjs expects.
//
// Source-map upload only happens when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set;
// without them the plugin is a no-op for uploads and the build still succeeds — so CI and local
// builds keep working with zero Sentry env configured.
const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Don't spam build logs when Sentry isn't configured (the common local/CI case).
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  // `disableLogger` was removed by the Sentry SDK and its replacement only
  // applies to webpack. Next 16 uses Turbopack, so leave debug logging at the
  // SDK default instead of passing an ignored, deprecated option.
};

module.exports = withSentryConfig(nextConfig, sentryOptions);
