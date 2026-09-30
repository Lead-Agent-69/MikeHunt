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
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- [ ] `FLARESOLVERR_URL` — FlareSolverr URL (for scrapers)
- [ ] `RESEND_API_KEY` — Resend email API key
- [ ] `TWILIO_ACCOUNT_SID` — Twilio account SID
- [ ] `TWILIO_AUTH_TOKEN` — Twilio auth token
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` — Gemini API key
- [ ] `OPENAI_API_KEY` — OpenAI API key (optional)
- [ ] `CRON_SECRET` — Cron job secret
- [ ] `INGEST_SECRET` — Ingest API secret

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

| Metric | Target | Status |
|--------|--------|--------|
| Build Time | < 60s | ~50s |
| Homepage Load | < 2s | TBD |
| LCP | < 2.5s | TBD |
| FID | < 100ms | TBD |
| CLS | < 0.1 | TBD |
| Lighthouse | > 90 | TBD |
| Uptime | > 99.9% | TBD |

---

## Sign-Off

- [ ] Build passes
- [ ] All checks complete
- [ ] Deployment successful
- [ ] Monitoring active
- [ ] Team notified

**Deployed by:** _______________
**Date:** _______________
**Version:** _______________
