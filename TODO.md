# DealerHunt Pro - TODO Checklist

**Last Updated:** June 24, 2026  
**Current Goal:** Soft Launch Ready (2 days)

---

## 🔥 TODAY - Critical Path (4-6 hours)

### 1. Start FlareSolverr (5 min)

```bash
cd ~/Developer/Autoverse

# Start container
docker run -d \
  --name flaresolverr \
  --restart always \
  -p 8191:8191 \
  -e LOG_LEVEL=warn \
  ghcr.io/flaresolverr/flaresolverr:latest

# Verify running
curl http://localhost:8191/v1

# Add to .env.local
echo 'FLARESOLVERR_URL=http://localhost:8191' >> .env.local

# Restart dev server
npm run dev
```

- [ ] Container running
- [ ] Endpoint responding
- [ ] Added to .env.local
- [ ] Dev server restarted

### 2. Update DealCard Component (30 min)

- [ ] Find DealCard component location
  ```bash
  # Search for it
  find . -name "*DealCard*" -type f | grep -v node_modules
  ```
- [ ] Read current image handling
- [ ] Update to use proxy for external URLs

  ```tsx
  const proxiedUrl = imageUrl?.startsWith("http")
    ? `/api/image/proxy?url=${encodeURIComponent(imageUrl)}`
    : imageUrl;

  <img
    src={proxiedUrl}
    alt={title}
    onError={(e) => {
      e.currentTarget.src = "/images/car-placeholder.jpg";
    }}
  />;
  ```

- [ ] Add placeholder image fallback
- [ ] Test with Craigslist deal
- [ ] Test with Cars.com deal
- [ ] Verify no CORS errors in console

### 3. Create Placeholder Images (10 min)

```bash
# Download or create placeholder
mkdir -p public/images
# Add a car placeholder image (512x384 recommended)
# Can use: https://placehold.co/512x384/1a1a1a/666666?text=No+Image
```

- [ ] Created public/images directory
- [ ] Added car-placeholder.jpg
- [ ] Verified image loads at /images/car-placeholder.jpg

### 4. Test All Scrapers (30 min)

```bash
# Test each scraper manually
npm run worker scrape:craigslist
npm run worker scrape:cars_com
npm run worker scrape:cargurus
npm run worker scrape:autotrader

# Check results in database
psql $DATABASE_URL -c "
  SELECT
    source,
    COUNT(*) as total_deals,
    COUNT(*) FILTER (WHERE active = true) as active_deals,
    MAX(created_at) as last_scraped
  FROM deals
  GROUP BY source
  ORDER BY total_deals DESC;
"
```

- [ ] Craigslist producing data
- [ ] Cars.com producing data
- [ ] CarGurus producing data
- [ ] AutoTrader producing data
- [ ] Each source has 50+ deals

### 5. Run Rescore on All Deals (1 hour)

```bash
# Create a rescore script
cat > scripts/rescore-all.sh << 'EOF'
#!/bin/bash
echo "Starting rescore of all active deals..."

for i in {0..50}; do
  echo "Processing page $i..."

  response=$(curl -s -X POST http://localhost:3000/api/admin/rescore \
    -H "Authorization: Bearer $INGEST_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"page\": $i, \"pageSize\": 100}")

  echo $response | jq

  # Check if we're done
  hasMore=$(echo $response | jq -r '.hasMore')
  if [ "$hasMore" = "false" ]; then
    echo "Rescore complete!"
    break
  fi

  sleep 3
done
EOF

chmod +x scripts/rescore-all.sh
./scripts/rescore-all.sh
```

- [ ] Script created
- [ ] Script executed
- [ ] All pages processed
- [ ] No errors in output
- [ ] Verify random deals have correct sell_estimate

### 6. Validate Data Quality (1 hour)

```sql
-- Check for obvious data issues

-- 1. Deals with missing critical fields
SELECT COUNT(*) as missing_critical
FROM deals
WHERE active = true
  AND (year IS NULL OR make IS NULL OR model IS NULL OR ask_price IS NULL);

-- 2. Deals with unrealistic prices
SELECT id, year, make, model, ask_price, sell_estimate
FROM deals
WHERE active = true
  AND (ask_price < 500 OR ask_price > 200000);

-- 3. Deals with broken profit calculations
SELECT id, year, make, model, ask_price, sell_estimate, true_net_profit
FROM deals
WHERE active = true
  AND deal_verdict = 'go'
  AND true_net_profit < 0;

-- 4. Image loading test
SELECT id, source, image_url
FROM deals
WHERE active = true
  AND image_url IS NOT NULL
LIMIT 10;

-- 5. Geographic data
SELECT
  location_state,
  COUNT(*) as deals,
  COUNT(latitude) as geocoded
FROM deals
WHERE active = true
GROUP BY location_state
ORDER BY deals DESC
LIMIT 10;
```

- [ ] <1% missing critical fields
- [ ] Flagged unrealistic prices
- [ ] No GO deals with negative profit
- [ ] Images load when tested in browser
- [ ] Geographic data present

### 7. Mobile Responsive Check (30 min)

Test on real phone or Chrome DevTools mobile view:

- [ ] /scan page loads
- [ ] Deal cards readable
- [ ] Filters usable
- [ ] Images load (use proxy)
- [ ] Navigation works
- [ ] No horizontal scroll
- [ ] Text is readable (not too small)
- [ ] Buttons are tappable (not too small)

---

## 🎯 TOMORROW - Feature Completion (6-8 hours)

### 1. Add Database Indexes (30 min)

```sql
-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_deals_active_verdict
  ON deals(active, deal_verdict)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_deals_make_model_year
  ON deals(make, model, year);

CREATE INDEX IF NOT EXISTS idx_deals_location_state
  ON deals(location_state)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_deals_profit_desc
  ON deals(true_net_profit DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_deals_created_desc
  ON deals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deals_source
  ON deals(source)
  WHERE active = true;

-- Analyze tables to update statistics
ANALYZE deals;
ANALYZE user_saved_searches;
ANALYZE market_aggregates;
```

- [ ] Indexes created
- [ ] ANALYZE run
- [ ] Test query performance (should be <100ms)

### 2. Set Up Stripe (2 hours)

- [ ] Create Stripe account (or use existing)
- [ ] Switch to test mode
- [ ] Create products:
  - [ ] Pro - $29/mo - Unlimited deals, alerts, saved searches
  - [ ] Elite - $79/mo - Auction Co-Pilot (coming soon) + Pro features
- [ ] Get API keys from Stripe dashboard
- [ ] Add to Vercel env vars:
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
  ```
- [ ] Test checkout flow in sandbox
- [ ] Verify webhook handling
- [ ] Test subscription creation
- [ ] Test cancellation flow

### 3. Build Max Bid Calculator Component (3 hours)

Create: `components/MaxBidCalculator.tsx`

```tsx
"use client";

import { useState } from "react";

interface MaxBidCalculatorProps {
  deal: {
    year: number;
    make: string;
    model: string;
    askPrice: number;
    sellEstimate: number;
    recommendedMaxBid: number;
    repairEstimate: number;
    transportEstimate: number;
  };
}

export function MaxBidCalculator({ deal }: MaxBidCalculatorProps) {
  const [customRepair, setCustomRepair] = useState(deal.repairEstimate);
  const [customTransport, setCustomTransport] = useState(
    deal.transportEstimate,
  );
  const [targetROI, setTargetROI] = useState(0.2);

  // Recalculate max bid with custom inputs
  const fixedCosts = customRepair + customTransport + deal.sellEstimate * 0.09;
  const maxTotal = deal.sellEstimate / (1 + targetROI);
  const maxBid = Math.max(0, Math.round(maxTotal - fixedCosts));

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xl font-bold mb-4">Max Bid Calculator</h3>

      {/* Platform recommendation */}
      <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--s2)" }}>
        <div className="text-sm text-[var(--t3)] mb-1">
          Platform Recommendation
        </div>
        <div className="text-3xl font-bold text-[var(--amber)]">
          ${deal.recommendedMaxBid.toLocaleString()}
        </div>
        <div className="text-sm text-[var(--t4)] mt-1">
          Based on 20% ROI target
        </div>
      </div>

      {/* Editable inputs */}
      <div className="space-y-4">
        <div>
          <label className="text-sm text-[var(--t3)] mb-2 block">
            Repair Cost
          </label>
          <input
            type="number"
            value={customRepair}
            onChange={(e) => setCustomRepair(Number(e.target.value))}
            className="w-full px-3 py-2 rounded"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          />
        </div>

        <div>
          <label className="text-sm text-[var(--t3)] mb-2 block">
            Transport Cost
          </label>
          <input
            type="number"
            value={customTransport}
            onChange={(e) => setCustomTransport(Number(e.target.value))}
            className="w-full px-3 py-2 rounded"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          />
        </div>

        <div>
          <label className="text-sm text-[var(--t3)] mb-2 block">
            Target ROI (%)
          </label>
          <input
            type="number"
            value={targetROI * 100}
            onChange={(e) => setTargetROI(Number(e.target.value) / 100)}
            step="1"
            className="w-full px-3 py-2 rounded"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          />
        </div>
      </div>

      {/* Recalculated max bid */}
      <div className="mt-6 p-4 rounded-lg" style={{ background: "var(--s2)" }}>
        <div className="text-sm text-[var(--t3)] mb-1">Your Custom Max Bid</div>
        <div className="text-2xl font-bold">${maxBid.toLocaleString()}</div>
      </div>

      {/* Breakdown */}
      <div className="mt-4 text-xs text-[var(--t4)] space-y-1">
        <div>Sell estimate: ${deal.sellEstimate.toLocaleString()}</div>
        <div>Repair: -${customRepair.toLocaleString()}</div>
        <div>Transport: -${customTransport.toLocaleString()}</div>
        <div>
          Selling fees (9%): -$
          {Math.round(deal.sellEstimate * 0.09).toLocaleString()}
        </div>
        <div>Target ROI: {(targetROI * 100).toFixed(0)}%</div>
      </div>
    </div>
  );
}
```

- [ ] Component created
- [ ] Added to deal detail page
- [ ] Tested with real deal
- [ ] Mobile responsive
- [ ] Calculations accurate

### 4. Set Up Error Monitoring (1 hour)

```bash
npm install @sentry/nextjs

# Run Sentry wizard
npx @sentry/wizard@latest -i nextjs
```

- [ ] Sentry installed
- [ ] API routes instrumented
- [ ] Frontend error boundaries added
- [ ] Test error is captured
- [ ] Alert notifications configured

### 5. Build Saved Searches UI (2 hours)

Create: `components/SavedSearchManager.tsx`

Basic CRUD interface for `user_saved_searches` table:

- [ ] List saved searches
- [ ] Create new search
- [ ] Edit existing search
- [ ] Delete search
- [ ] Toggle email alerts on/off
- [ ] Test alert triggers

---

## 📅 THIS WEEK - Soft Launch (Remaining 3 Days)

### Day 3: Testing & Validation

- [ ] End-to-end test: Sign up → Browse deals → Save search → Get alert
- [ ] Performance test: Page load times <2 seconds
- [ ] Mobile test: Complete flow on real phone
- [ ] Data validation: Spot check 20 random deals
- [ ] Email deliverability: Test alerts send
- [ ] Create test dealer account

### Day 4: Dealer Feedback

- [ ] Invite 5 dealers to test
- [ ] Give each test account credentials
- [ ] Walk through app on call
- [ ] Collect feedback (record notes)
- [ ] Identify top 3 pain points

### Day 5: Quick Fixes

- [ ] Fix top bugs found by dealers
- [ ] Polish rough edges
- [ ] Add missing tooltips/help text
- [ ] Update copy based on confusion points
- [ ] Prepare for public beta

---

## 📋 NEXT 2 WEEKS - Public Beta

### Week 2: Billing + Core Features

- [ ] Stripe live mode configured
- [ ] Subscription enforcement (paywall)
- [ ] Email alert system working
- [ ] Geographic filtering UI
- [ ] Market timing badges visible
- [ ] Deal IQ breakdowns shown
- [ ] Legal docs (TOS, Privacy)

### Week 3: Polish + Scale Prep

- [ ] Onboarding flow for new users
- [ ] Admin dashboard (basic metrics)
- [ ] Customer support system (email/chat)
- [ ] Referral program (optional)
- [ ] Press kit / landing page refresh
- [ ] Beta waitlist signup
- [ ] Launch to 20 dealers

---

## 🎯 METRICS TO TRACK

### Daily

- [ ] Active deals count (target: 1,000+)
- [ ] Scrapers running (4 of 4 healthy)
- [ ] Error rate (<1%)
- [ ] API response times (<500ms p95)

### Weekly

- [ ] New signups
- [ ] Free → Paid conversions
- [ ] Churn rate
- [ ] MRR growth
- [ ] Deal accuracy reports from dealers

### Monthly

- [ ] Total MRR
- [ ] Active paying dealers
- [ ] Outcome logs submitted
- [ ] Feature usage (which features used most?)
- [ ] Support tickets volume

---

## ✅ DONE (Track Progress)

### Completed Today

- [x] Fixed sell_estimate write-back bug
- [x] Enhanced outlier rejection in median calculation
- [x] Created image proxy route
- [ ] Started FlareSolverr
- [ ] Updated DealCard component
- [ ] Ran rescore on deals

### Completed This Week

- [ ] All critical bugs fixed
- [ ] 4 scrapers producing data
- [ ] Images loading correctly
- [ ] Data quality validated
- [ ] Mobile responsive verified
- [ ] Soft launch ready

---

## 🚨 BLOCKERS (Update as Encountered)

**Current blockers:** None identified

**Risks:**

- FlareSolverr might not work with some sites (test thoroughly)
- Stripe webhook handling might have edge cases
- Mobile experience might need more work than expected

---

## 💡 NOTES & LEARNINGS

**Add notes here as you work:**

-
-
- ***

  **Last Updated:** June 24, 2026  
  **Next Review:** End of day (after completing TODAY section)  
  **Owner:** You
