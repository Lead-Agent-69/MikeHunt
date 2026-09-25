# Quick Fix Guide - Get DealerHunt Pro Working Today

**Time to complete:** 30 minutes  
**Impact:** Fix all critical bugs, unlock 10x deal volume, enable monetization

---

## Step 1: Start FlareSolverr (5 min)

FlareSolverr bypasses CloudFlare protection so scrapers can access Cars.com, CarGurus, and AutoTrader.

```bash
# Start FlareSolverr container
docker run -d \
  --name flaresolverr \
  --restart always \
  -p 8191:8191 \
  -e LOG_LEVEL=warn \
  ghcr.io/flaresolverr/flaresolverr:latest

# Verify it's running
curl http://localhost:8191/v1
```

**Add to `.env.local`:**
```bash
FLARESOLVERR_URL=http://localhost:8191
```

**Result:** Unlocks 90% of deal inventory (Cars.com, CarGurus, AutoTrader)

---

## Step 2: Update DealCard Component (10 min)

Fix Craigslist image hotlink blocking by routing through the proxy.

**Find file:** `components/shared/DealCard.tsx` (or wherever deal cards render images)

**Change:**
```tsx
// Before (broken)
<img src={deal.imageUrl} alt={deal.title} />

// After (works)
<img 
  src={deal.imageUrl?.startsWith('http') 
    ? `/api/image/proxy?url=${encodeURIComponent(deal.imageUrl)}`
    : deal.imageUrl
  } 
  alt={deal.title}
  onError={(e) => {
    // Fallback to placeholder if proxy fails
    e.currentTarget.src = '/images/car-placeholder.jpg';
  }}
/>
```

**Result:** All deal card images will load, even from Craigslist

---

## Step 3: Add Vercel Environment Variables (15 min)

Go to: https://vercel.com/[your-username]/autoverse/settings/environment-variables

**Add these variables for Production + Preview + Development:**

### Required for Payments
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Required for Notifications
```
RESEND_API_KEY=re_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

### Required for AI Features
```
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

### Required for Security
```
CRON_SECRET=[generate random 32 char string]
INGEST_SECRET=[generate random 32 char string]
```

### Required for Scraping (Production)
```
FLARESOLVERR_URL=http://flaresolverr:8191
```

**To generate secrets:**
```bash
openssl rand -hex 32
```

**After adding:** Redeploy from Vercel dashboard

**Result:** Stripe payments work, emails send, AI features enabled

---

## Step 4: Run Rescore on Existing Deals (Optional but Recommended)

Fix all existing deals that have wrong `sell_estimate` values.

```bash
# Local
curl -X POST http://localhost:3000/api/admin/rescore \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"page": 0, "pageSize": 100}'

# Production (after env vars deployed)
curl -X POST https://autoverse.vercel.app/api/admin/rescore \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"page": 0, "pageSize": 100}'
```

**Loop through all pages:**
```bash
for i in {0..10}; do
  curl -X POST http://localhost:3000/api/admin/rescore \
    -H "Authorization: Bearer $INGEST_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"page\": $i, \"pageSize\": 100}"
  sleep 5
done
```

**Result:** All deal cards show correct profit estimates and IQ scores

---

## Step 5: Verify Everything Works

### Check Database
```sql
-- Should see deals from multiple sources
SELECT source, COUNT(*) as count, MAX(created_at) as last_seen
FROM deals 
WHERE active = true
GROUP BY source;

-- Should see reasonable sell_estimate values (1.1x - 1.5x ask_price)
SELECT year, make, model, ask_price, sell_estimate, true_net_profit
FROM deals
WHERE active = true AND deal_verdict = 'go'
ORDER BY true_net_profit DESC
LIMIT 10;
```

### Check UI
1. Go to `/scan` page
2. Images should load (no broken icons)
3. IQ chips should show accurate numbers
4. Deal cards should show from multiple sources (not just Craigslist)

### Check Scrapers
```bash
# Trigger a manual scrape
npm run worker scrape:cars_com

# Check logs
tail -f .next.log
```

---

## Troubleshooting

### FlareSolverr not starting
```bash
# Check if Docker is running
docker info

# Check logs
docker logs flaresolverr

# Restart
docker restart flaresolverr
```

### Images still not loading
1. Check browser console for errors
2. Verify proxy route exists: `app/api/image/proxy/route.ts`
3. Test proxy directly: `http://localhost:3000/api/image/proxy?url=https://...`

### Scrapers not working
1. Check FlareSolverr is running: `curl http://localhost:8191/v1`
2. Check env var: `echo $FLARESOLVERR_URL`
3. Restart dev server after adding env var
4. Check worker logs for errors

### Vercel env vars not working
1. Make sure to add for all environments (Production + Preview + Development)
2. Redeploy after adding
3. Check Vercel logs for errors

---

## Success Criteria

After completing all steps, you should see:

✅ **Deal Volume:** 500+ active deals from multiple sources  
✅ **Images:** All deal cards show images (no broken icons)  
✅ **Accuracy:** IQ chips show correct profit estimates  
✅ **Payments:** Can create Stripe checkout (test mode)  
✅ **Notifications:** Emails send via Resend  

---

## What's Next? (Phase 1)

After these bugs are fixed, Phase 1 begins:

### Week 1-2: Auction Co-Pilot
- Design "Lane Mode" stripped-down UI
- Build run list upload
- VIN scanner with device camera
- Offline caching for auction use

This is the **make-or-break feature**. If dealers don't use it at real auctions, pivot immediately.

---

## Cost Tracker

**Current monthly burn:**
- Supabase Pro: $25/mo
- Vercel Pro: $20/mo  
- OpenAI API: ~$5-10/mo
- FlareSolverr: $0 (self-hosted Docker)
- Nominatim: $0 (free geocoding)
- OpenStreetMap: $0 (free maps)

**Total: ~$50/mo** (scales with usage)

---

## Time Investment

- Phase 0 (bugs): 1 day (today)
- Phase 1 (Auction Co-Pilot): 2 weeks
- Phase 2 (Private Seller Radar): 2 weeks
- Phase 3 (Outcome Logging): 2 weeks
- Phase 4 (Floorplan): 2 weeks

**To MVP with moat:** 9 weeks total

**To $10K MRR:** 12-16 weeks (if Auction Co-Pilot converts)

---

**Ready?** Start with Step 1 (FlareSolverr). Everything else builds on that.
