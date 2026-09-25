# DealerHunt Pro Intelligence Expansion - Implementation Checklist

## Quick Reference

**Main Blueprint:** See `INTELLIGENCE-EXPANSION-BLUEPRINT.md` for complete details  
**This Document:** Step-by-step checklist for execution

---

## Day 1: Foundation Setup

### Database Setup

- [ ] Run all SQL migrations from blueprint (price_alerts, saved_searches, dealer_deals, etc.)
- [ ] Add new columns to existing `deals` table
- [ ] Enable PostGIS extension in Supabase
- [ ] Set up pg_cron extension
- [ ] **CRITICAL:** Start daily price snapshot pg_cron job (needs 30 days to mature)
- [ ] Verify all tables exist with `SELECT * FROM information_schema.tables WHERE table_schema = 'public'`

### Environment Check

- [ ] Verify Supabase connection working
- [ ] Verify Redis/BullMQ setup for workers
- [ ] Verify Resend API key for email notifications
- [ ] Verify Twilio credentials for SMS (optional)
- [ ] Test Leaflet.js/React-Leaflet imports working

---

## Week 1: Core Features

### Feature 1: Max Bid Engine (Day 1-2)

- [ ] Create API route: `app/api/deal/calculate-max-bid/route.ts`
- [ ] Create UI component: `components/MaxBidCalculator.tsx`
- [ ] Add component to deal page
- [ ] Test with 5 real deals
- [ ] Verify calculation accuracy
- [ ] Deploy to staging

### Feature 2: Flash Deal Feed (Day 2-3)

- [ ] Create query logic for flash deals (listings <24h old, GO verdict, 10%+ below market)
- [ ] Add `flash_eligible` column to deals table
- [ ] Create background job: `workers/flashDealScan.ts`
- [ ] Create UI tab/page for flash deals
- [ ] Add countdown timer component
- [ ] Test with real data
- [ ] Schedule job to run hourly

### Feature 3: Price Sniper (Day 3-4)

- [ ] Create `price_alerts` table (if not done)
- [ ] Create API routes: create, list, delete alerts
- [ ] Create background job: `workers/priceAlertCheck.ts`
- [ ] Create UI: alert creation form + alert list
- [ ] Set up email notification template
- [ ] Set up SMS notification (optional)
- [ ] Test alert matching logic
- [ ] Schedule job to run every 15 minutes
- [ ] Test end-to-end: create alert → scrape → receive notification

### Feature 4: Saved Search Alerts (Day 4-5)

- [ ] Create `saved_searches` table (if not done)
- [ ] Create API routes: create, list, update, delete searches
- [ ] Create matching algorithm in `workers/savedSearchMatch.ts`
- [ ] Create UI: search creation form + search management
- [ ] Test matching logic with complex criteria
- [ ] Set up notification templates
- [ ] Schedule job to run every 30 minutes
- [ ] Test end-to-end

**Week 1 Checkpoint:** Dealers can calculate max bids, see flash deals, set price alerts, save search criteria

---

## Week 2-3: The Lock (Outcome Logging)

### Outcome Logging System (Week 2)

- [ ] Create `dealer_deals` table (if not done)
- [ ] Create API route: `app/api/outcomes/log/route.ts`
- [ ] Create "Save Deal" functionality
- [ ] Create outcome logging UI component: `components/OutcomeLogger.tsx`
- [ ] Add to saved deals page
- [ ] Create notification templates:
  - [ ] "Did you buy this car?" (24h after save)
  - [ ] "Sold yet?" (weekly if purchased)
- [ ] Test purchase logging
- [ ] Test sale logging
- [ ] Verify calculations (actual profit = sell - buy - costs)

### Dealer AI Calibration (Week 3)

- [ ] Create `dealer_calibration` table
- [ ] Create `calibration_history` table
- [ ] Implement calibration algorithm: `lib/intelligence/dealerAI.ts`
- [ ] Create function: `getDealerCalibration(userId)`
- [ ] Create function: `getCalibratedEstimate(userId, deal)`
- [ ] Create function: `updateDealerCalibration(userId)`
- [ ] Hook into outcome logging (auto-update after each logged outcome)
- [ ] Create calibration dashboard UI
- [ ] Show: transport/recon multipliers, accuracy %, sample size, confidence score
- [ ] Apply calibration to profit estimates on deal pages
- [ ] Test with mock outcome data

**Week 2-3 Checkpoint:** Dealers can log outcomes, system learns their cost structure, estimates improve

---

## Week 4-5: Price Intelligence (Requires 30 days of snapshot data)

### Price History Graph

- [ ] Verify price snapshots accumulating (check `vehicle_price_snapshots` table)
- [ ] Create API route: `app/api/intelligence/price-history/route.ts`
- [ ] Create sparkline component: `components/PriceHistoryChart.tsx`
- [ ] Add to deal page
- [ ] Test with vehicles that have 30+ days data
- [ ] Handle cases with insufficient data gracefully

### Market Timing Signal

- [ ] Implement timing algorithm: `lib/intelligence/marketTiming.ts`
- [ ] Create API route: `app/api/intelligence/market-timing/route.ts`
- [ ] Create badge component: `components/MarketTimingBadge.tsx`
- [ ] Add to deal cards and deal page
- [ ] Test signals: WAIT (down 5%+), BUY_NOW (up 3%+), STABLE
- [ ] Add caching if needed

**Week 4-5 Checkpoint:** Dealers see price trends and market timing recommendations

---

## Week 6-7: Geographic Intelligence

### Geocoding Setup

- [ ] Create geocoding utility: `lib/geocoding.ts` with Nominatim
- [ ] Add rate limiting (1 req/sec)
- [ ] Set proper User-Agent header
- [ ] Create geocoding worker: `workers/geocodeListing.ts`
- [ ] Test on 10 sample deals
- [ ] Schedule job to run continuously (process 50/run)
- [ ] Monitor geocoding coverage (target: 90%+)

### Deal Map

- [ ] Add Leaflet marker icons to `/public/markers/` (green, blue, orange)
- [ ] Create map component: `components/MapView.tsx`
- [ ] Create map page: `app/(dashboard)/map/page.tsx`
- [ ] Add radius slider
- [ ] Add marker clustering for performance
- [ ] Add deal popup on marker click
- [ ] Test PostGIS spatial queries
- [ ] Optimize for 500+ markers
- [ ] Add attribution for OpenStreetMap

**Week 6-7 Checkpoint:** Dealers can see deals geographically, filter by radius, visualize sourcing strategy

---

## Week 8: Polish & Additional Features

### Distressed Inventory Feed

- [ ] Add keyword detection to scraper normalize step
- [ ] Keywords: "repo", "bank owned", "liquidation", "estate", "salvage"
- [ ] Populate `distress_signals` array on deals
- [ ] Create filter UI on browse page
- [ ] Test with known distressed listings
- [ ] Create dedicated "Distressed" tab/page

### Auction Heat Score (Optional)

- [ ] Create `deal_views` tracking table
- [ ] Track view events (without PII)
- [ ] Calculate heat score: Cold, Warm, Hot, Bidding War
- [ ] Add badge to deal cards
- [ ] Test with high-traffic deals

### Analytics Dashboard (Admin)

- [ ] Create admin page: `app/admin/analytics/page.tsx`
- [ ] Show: total dealers, calibrated dealers, system-wide accuracy
- [ ] Show: activation funnel (signups → saved → logged outcomes)
- [ ] Show: price snapshot coverage by vehicle class
- [ ] Show: geocoding coverage %

**Week 8 Checkpoint:** All features complete, polished, tested

---

## Testing Checklist

### Unit Tests

- [ ] Max bid calculation with various inputs
- [ ] Price alert matching logic
- [ ] Saved search matching logic
- [ ] Calibration algorithm with sample outcomes
- [ ] Market timing signal calculation
- [ ] Geocoding with rate limiting

### Integration Tests

- [ ] Full outcome logging flow
- [ ] Price alert triggering → notification
- [ ] Saved search matching → notification
- [ ] Calibration update after outcome logged

### E2E Tests

- [ ] New dealer signs up
- [ ] Saves first deal
- [ ] Sets price alert
- [ ] Creates saved search
- [ ] Logs first outcome
- [ ] Sees calibration improve
- [ ] Views deal map

---

## Deployment Checklist

### Pre-Deploy

- [ ] All database migrations run on production
- [ ] Environment variables set (Supabase, Redis, Resend, Twilio)
- [ ] pg_cron job scheduled and running
- [ ] Workers deployed and running
- [ ] Error logging/monitoring set up (Sentry already configured)

### Deploy

- [ ] Deploy to production (Vercel)
- [ ] Verify workers running on Railway/server
- [ ] Verify pg_cron job running (check last snapshot time)
- [ ] Smoke test: create account, save deal, set alert

### Post-Deploy

- [ ] Monitor error logs for 24 hours
- [ ] Check worker success rates
- [ ] Verify notifications sending
- [ ] Check geocoding progress
- [ ] Monitor price snapshot accumulation

---

## Monitoring & Maintenance

### Daily

- [ ] Check price snapshot job ran (last run <24h ago)
- [ ] Check worker error rates
- [ ] Check notification delivery rates

### Weekly

- [ ] Review calibration coverage (% of dealers with 5+ outcomes)
- [ ] Review geocoding coverage (% of deals with coordinates)
- [ ] Review activation funnel metrics

### Monthly

- [ ] Review system-wide accuracy metrics
- [ ] Review dealer engagement (WAU, outcomes logged)
- [ ] Review pricing tier conversions
- [ ] Plan feature improvements based on data

---

## Success Metrics

### Month 1

- [ ] 50+ dealers signed up
- [ ] 200+ deals saved
- [ ] 100+ price alerts created
- [ ] 50+ saved searches created
- [ ] 20+ outcomes logged

### Month 2

- [ ] 150+ dealers signed up
- [ ] 600+ deals saved
- [ ] 50+ outcomes logged
- [ ] 10+ dealers with 5+ outcomes (starting calibration)

### Month 3

- [ ] 300+ dealers signed up
- [ ] 30+ days of price history accumulated
- [ ] Market timing signals showing for major vehicle classes
- [ ] 30+ dealers with 10+ outcomes (calibration improving)
- [ ] 15-20% conversion to Pro tier

### Month 6

- [ ] 1,000+ dealers
- [ ] 90+ days price history
- [ ] 100+ dealers with 20+ outcomes (fully calibrated)
- [ ] System-wide accuracy: 85%+
- [ ] MRR: $5,000+ (from Pro/Pro Plus subscriptions)

---

## Common Issues & Solutions

### Issue: Price snapshots not accumulating

**Solution:** Check pg_cron job status. Verify deals table has recent data. Check snapshot SQL query.

### Issue: Geocoding too slow

**Solution:** Normal. Nominatim is 1 req/sec. Let it run continuously. After 30 days, most deals geocoded.

### Issue: Dealers not logging outcomes

**Solution:** Send reminder notifications. Show value comparison. Gamify calibration progress.

### Issue: Workers not running

**Solution:** Check Redis connection. Verify environment variables. Check logs for errors.

### Issue: Notifications not sending

**Solution:** Verify Resend API key. Check email template format. Check user email verification status.

---

## Quick Commands

```bash
# Run migrations
npm run db:migrate

# Test worker locally
npm run worker:dev

# Check price snapshots
psql $DATABASE_URL -c "SELECT COUNT(*), MAX(snapshot_date) FROM vehicle_price_snapshots;"

# Check geocoding coverage
psql $DATABASE_URL -c "SELECT COUNT(*) FILTER (WHERE lat IS NOT NULL)::float / COUNT(*) * 100 as geocoded_pct FROM deals;"

# Check calibration coverage
psql $DATABASE_URL -c "SELECT COUNT(*) as calibrated_dealers FROM dealer_calibration WHERE sample_size >= 10;"
```

---

## Next Steps After Blueprint Complete

1. **Pilot Program:** Get 10-20 friendly dealers, personally onboard them, get feedback
2. **Content Marketing:** Write guides on "How to Bid Smarter at Auction"
3. **SEO:** Target "car arbitrage calculator", "dealer profit calculator", etc.
4. **Partnerships:** Reach out to transport companies, recon shops, offer integration
5. **Scale:** Once 100 dealers are active and logging outcomes, start paid tier
6. **Data Products:** Sell aggregated market intelligence to auction houses, lenders

---

**This checklist maps directly to the blueprint. Check items off as you complete them.**

**Estimated Total Time:** 8-12 weeks from start to fully intelligent platform

**Get started today:** Run the database migrations, start the price snapshot job, then build Max Bid Engine.

Good luck! 🚀
