# MikeHunt — Production Deployment Checklist

**Date:** September 30, 2026
**Status:** Ready for Deployment
**Build:** Passing

---

## Pre-Deployment Verification

### Build & Code Quality

- [x] `npm run build` passes
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes (warnings only)
- [x] All 47 routes compile
- [x] All 25+ UI components compile
- [x] All 14 carousel components compile

### Environment Variables

> Verified against production with `npx vercel env ls production` on 2026-09-30.

**Present in Vercel (Production) — 8/8 required:**

- [x] `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- [x] `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- [x] `CRON_SECRET` — Cron job secret (also doubles as the scrape shared secret)
- [x] `SCRAPE_SECRET` — Scraper-control API secret
- [x] `INGEST_SECRET` — Ingest API secret
- [x] `NEXT_PUBLIC_APP_URL` — Canonical app URL
- [x] `ADMIN_EMAIL` — **added 2026-09-30.** `lib/auth/admin.ts` now fails CLOSED with no
      fallback, so without this the `/developer`, `/status` and `/orchestrator` routes lock
      every user out (there is no other admin path).

**Intentionally NOT set — do not add placeholders:**

- [ ] `FLARESOLVERR_URL` — scrapers run in Zeus Docker, not in Vercel's serverless
      functions. A placeholder here would only ever be read by code that can't reach it.
- [ ] `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — no value exists yet.
      Feature-specific code degrades gracefully when they are absent; a fake value would
      turn a silent skip into a failing outbound call.
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` — embeddings only. `/api/embeddings/backfill`
      short-circuits with `{skipped:true}` when unset, so it is safe to omit until a key
      is provisioned.
- [ ] `OPENAI_API_KEY` — optional.
- [ ] `REDIS_URL` — no production Redis is provisioned. The queue routes now always read
      this from the environment (client-supplied `redisUrl` was removed as part of P0).

### Database

- [ ] Supabase migrations are up to date
- [ ] All tables exist (deals, dealers, saved_cars, etc.)
- [ ] RLS policies are configured
- [ ] Indexes are created
- [ ] Database backups are configured

### PWA

- [x] Manifest is valid
- [x] Service worker caches correctly
- [x] Offline page works
- [x] Icons are generated (all sizes)
- [x] Apple touch icons are set
- [x] Maskable icons are set

### Security

- [ ] HTTPS is enforced
- [ ] CORS is configured
- [ ] API routes are protected
- [ ] Auth flow is secure
- [ ] Secrets are not exposed
- [ ] Rate limiting is configured

### Performance

- [x] Images are lazy loaded
- [x] Code splitting is enabled
- [x] Bundle size is optimized
- [x] Core Web Vitals are monitored
- [x] Caching headers are set

---

## Vercel Deployment Steps

### 1. Connect Repository

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project
vercel link
```

### 2. Set Environment Variables

```bash
# Required
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY

# Scraper
vercel env add FLARESOLVERR_URL

# Notifications
vercel env add RESEND_API_KEY
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN

# AI
vercel env add GOOGLE_GENERATIVE_AI_API_KEY

# Security
vercel env add CRON_SECRET
vercel env add INGEST_SECRET
```

### 3. Deploy

```bash
# Deploy to production
vercel --prod
```

### 4. Verify Deployment

- [ ] Homepage loads
- [ ] Auth flow works
- [ ] Dashboard loads
- [ ] Deals are displayed
- [ ] Search works
- [ ] Filters work
- [ ] PWA installs
- [ ] Offline mode works
- [ ] All carousels work
- [ ] All animations work
- [ ] No console errors
- [ ] No 404s

---

## Post-Deployment

### Monitoring

- [ ] Set up Sentry error tracking
- [ ] Set up Vercel Analytics
- [ ] Set up Speed Insights
- [ ] Set up uptime monitoring
- [ ] Set up error alerts

### DNS & Domain

- [ ] Configure custom domain
- [ ] Set up SSL
- [ ] Set up redirects
- [ ] Set up www redirect

### Backup & Recovery

- [ ] Database backups configured
- [ ] Recovery plan documented
- [ ] Rollback procedure tested

---

## Rollback Plan

If deployment fails:

1. `vercel rollback` — Revert to previous deployment
2. `vercel env rm <variable>` — Remove problematic env var
3. `vercel --prod` — Redeploy

---

## Success Criteria

| Metric        | Target  | Status |
| ------------- | ------- | ------ |
| Build Time    | < 60s   | ~50s   |
| Homepage Load | < 2s    | TBD    |
| LCP           | < 2.5s  | TBD    |
| FID           | < 100ms | TBD    |
| CLS           | < 0.1   | TBD    |
| Lighthouse    | > 90    | TBD    |
| Uptime        | > 99.9% | TBD    |

---

## Sign-Off

- [ ] Build passes
- [ ] All checks complete
- [ ] Deployment successful
- [ ] Monitoring active
- [ ] Team notified

**Deployed by:** ******\_\_\_******
**Date:** ******\_\_\_******
**Version:** ******\_\_\_******
