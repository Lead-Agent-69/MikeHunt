const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  transpilePackages: ['@supabase/supabase-js'],
  serverExternalPackages: [
    'playwright',
    'playwright-extra',
    'patchright',
    'puppeteer-extra-plugin-stealth',
    'bull',
    'bullmq',
    'ioredis',
  ],
  // Scraping runs on GitHub Actions, not Vercel serverless. Keep heavy browser/scraper
  // packages external so the Next build never tries to bundle Chromium into functions.

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.copart.com' },
      { protocol: 'https', hostname: 'cs.copart.com' },
      { protocol: 'https', hostname: 'iaai-img-web.azureedge.net' },
      { protocol: 'https', hostname: '*.craigslist.org' },
      { protocol: 'https', hostname: 'i.ebayimg.com' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
      { protocol: 'https', hostname: 'media.ed.edmunds-media.com' },
      { protocol: 'https', hostname: 'vehicle-photos.carmax.com' },
      { protocol: 'https', hostname: '*.cargurus.com' },
      { protocol: 'https', hostname: '*.autotrader.com' },
      { protocol: 'https', hostname: '*.carvana.io' },
      { protocol: 'https', hostname: '*.vroomcdn.com' },
      { protocol: 'https', hostname: '*.truecar.com' },
      { protocol: 'https', hostname: '*.offerupnow.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  async redirects() {
    return [
      { source: '/deals', destination: '/find', permanent: false },
      { source: '/scanner', destination: '/scan', permanent: false },
      { source: '/syndicate', destination: '/list', permanent: false },
      { source: '/watchlist', destination: '/fleet', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            // D4: permissive on script/style/img (Next inline bootstrap + scraped https images) to
            // avoid breakage, strict on the high-value XSS / clickjacking / injection directives.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
              "style-src 'self' 'unsafe-inline' https:",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "connect-src 'self' https: wss:",
              "frame-src 'self' https://*.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
