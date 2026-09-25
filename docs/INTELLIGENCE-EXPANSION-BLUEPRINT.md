# DealerHunt Pro Intelligence Expansion Blueprint

## Complete Implementation Plan — Travel Platform Features for Car Dealers

**Version:** 2.0  
**Date:** June 22, 2026  
**Status:** Ready for Implementation  
**Goal:** Transform DealerHunt from a deal finder into a profit intelligence platform that compounds value over time

---

## Executive Summary

This blueprint translates competitive advantages from Kayak, Priceline, Vrbo, and Booking.com into the car dealer world. The result: **7 core features** that make dealers money immediately, plus **3 compounding features** that create a data moat no competitor can replicate.

### The Real Hook

**"Use DealerHunt Pro for 30 days. Log your deals. We'll show you exactly how much more profit you're making."**

Most dealers discover they're making **$200-$500 more per deal** with smarter bidding and better sourcing.

### The Lock

After 30 logged deals, the platform knows their cost structure better than their accountant does. Switching means losing personalized accuracy worth thousands per year.

---

## What Makes This Different

| Competitor  | Their Model     | DealerHunt Pro Advantage                                        |
| ----------- | --------------- | --------------------------------------------------------------- |
| CarGurus    | Static listings | Real-time intelligence + personalized profit predictions        |
| Manheim     | Vendor lock-in  | Your own data = vendor independence after 90 days               |
| NADA Guides | Generic pricing | Learns YOUR costs specifically, 6% more accurate                |
| AutoTrader  | Browse only     | Active intelligence: alerts, timing signals, max bid calculator |

**The Moat:** Every dealer who logs outcomes feeds the system. After 6 months, you have proprietary market data worth more than all the features combined.

---

## Current Stack (What You Already Have)

✅ **Frontend:** Next.js 15, React, TypeScript, Tailwind  
✅ **Backend:** Supabase (Postgres + Auth + Realtime)  
✅ **Scraping:** 60+ sources via Playwright/Patchright on GitHub Actions  
✅ **Jobs:** BullMQ + Redis ready  
✅ **Map Library:** Leaflet.js + React-Leaflet installed  
✅ **Data Pipeline:** Scrape → normalize → score → upsert → price_history  
✅ **Profit Calculator:** `lib/scoring/deal-analyzer.ts` with verdict + max bid

**No new vendors needed. No new API keys. Everything hooks into existing infrastructure.**

---

## The 10 Features (Inspired by Travel Platforms)

### Phase 1: Immediate Value (Ship Week 1-2)

#### 1. **Max Bid Engine** (from Priceline's "Name Your Price")

**Value:** Stops dealers from overbidding and blowing their margin  
**ROI:** $200-500 saved per deal

**How it works:**

- Dealer sets target profit ($2,000)
- System calculates: `max_bid = market_price - target_profit - transport - recon - fees`
- Shows: "DO NOT BID ABOVE $9,200"

**Implementation:**

- API route: `app/api/deal/calculate-max-bid/route.ts`
- Uses existing `deals.sell_estimate` and cost data
- UI: Collapsible calculator on deal page
- Time: 4 hours

---

#### 2. **Price Sniper** (from Kayak's Price Alerts)

**Value:** Dealers set target prices, get instant notifications when ANY listing hits that price  
**ROI:** Finds 2-3 extra deals/week passively

**How it works:**

- Dealer: "Alert me when any 2018 Honda Accord hits $9,000 or below"
- Background job runs after each scrape batch
- Matches new listings → push notification + email

**Implementation:**

- Table: `price_alerts` (user_id, make, model, year_min/max, target_price, radius)
- Job: `workers/priceAlertCheck.ts` (runs after scraper)
- UI: Button on deal page "Set Price Alert"
- Notifications: Resend email + Twilio SMS (already integrated)
- Time: 6 hours

---

#### 3. **Saved Search Alerts** (from Vrbo's Saved Searches)

**Value:** Monitor full criteria profiles 24/7, not just single prices  
**ROI:** Never miss a deal that fits your sweet spot

**How it works:**

- Dealer saves: "2016-2019 Honda Accord, max $10k, min $1,500 profit, within 200 miles, GO only"
- System monitors all new listings against all saved searches
- Push notification when matches appear

**Implementation:**

- Table: `saved_searches` (user_id, makes[], models[], year_min/max, price_max, min_profit, radius, verdicts[])
- Job: `workers/savedSearchMatch.ts`
- UI: "Save this search" button on browse/filter screen
- Time: 8 hours

---

#### 4. **Flash Deal Feed** (from Booking.com's Flash Deals)

**Value:** Time-sensitive deals with countdown timers  
**ROI:** First access to premium opportunities

**How it works:**

- Query: listings created <24h ago, GO verdict, 10%+ below market
- Show countdown timer
- Sort by profit potential

**Implementation:**

- No new tables needed (query existing `deals`)
- UI: New tab on home screen
- Job: `workers/flashDealScan.ts` (runs hourly, marks eligible deals)
- Time: 4 hours

**Phase 1 Total: 22 hours (3 days)**

---

### Phase 2: Data Accumulation (Start Week 1, Ship Week 5-8)

#### 5. **Price History Graph** (from Kayak's Price Trends)

**Value:** See if prices are climbing or falling over 90 days  
**ROI:** Buy 5% cheaper by timing the market = $500+ per deal

**How it works:**

- Daily pg_cron job aggregates prices by make/model/year
- After 30 days, show sparkline chart on deal page
- Visual: "Prices down 9% this month"

**Implementation:**

- Table: `vehicle_price_snapshots` (make, model, year, avg_price, median, min, max, sample_count, snapshot_date)
- pg_cron job: Runs 2am daily (SQL only, no worker needed)
- UI: Sparkline chart component on deal page
- **START THIS JOB NOW** even before UI is built (data needs to mature)
- Time: 6 hours setup + 30 days accumulation

---

#### 6. **Market Timing Signal** (from Kayak's "Buy Now or Wait")

**Value:** System tells you if NOW is the right time to buy  
**ROI:** Avoid buying when market is hot, buy when cold

**How it works:**

- Compares last 7 days avg vs 30 days avg
- If down 5%+: Show "⏸️ WAIT - Prices falling"
- If up 3%+: Show "⚡ BUY NOW - Prices climbing"
- If stable: Show "📊 STABLE"

**Implementation:**

- Builds on `vehicle_price_snapshots` (needs 30 days data)
- Calculation in `lib/intelligence/marketTiming.ts`
- UI: Badge on deal card
- Time: 4 hours

---

#### 7. **Deal Map** (from Vrbo's Map View)

**Value:** See all GO deals geographically, drag radius, visualize transport costs  
**ROI:** Access 3x more inventory by expanding radius

**How it works:**

- All GO deals as pins, color-coded
- Tap pin → deal card popup
- Drag radius slider → map updates
- Transport cost adjusts by distance

**Implementation:**

- Leaflet.js + React-Leaflet (already installed!)
- OpenStreetMap tiles (free, just attribution)
- Nominatim geocoding (free, 1 req/sec)
- PostGIS for spatial queries (enable in Supabase)
- Job: `workers/geocodeListing.ts` (geocodes new listings without coords)
- UI: New "Map" tab
- Time: 12 hours

---

#### 8. **Distressed Inventory Feed** (from Priceline's Express Deals)

**Value:** Surface repos, liquidations, estate sales - cluster below market  
**ROI:** 20-30% higher margins

**How it works:**

- Scraper detects keywords: "repo", "bank owned", "liquidation", "estate sale"
- Tags listing with `distress_signals[]`
- Filter view: "Show only distressed"

**Implementation:**

- Column: `deals.distress_signals TEXT[]` (already exists)
- Scraper enhancement: keyword detection in `lib/scrapers/pipeline/normalize.ts`
- UI: Filter toggle on browse page
- Time: 3 hours

**Phase 2 Total: 25 hours + 30 days data accumulation**

---

### Phase 3: Compounding Intelligence (Month 2-3)

#### 9. **Dealer Intelligence Score** (from Booking.com's Genius Loyalty)

**Value:** Platform learns YOUR cost structure, estimates get more accurate over time  
**ROI:** After 30 deals, 6% more accurate = $1,000+ extra profit/year

**How it works:**

- Dealer logs outcomes (purchase price, sell price, actual costs)
- System calculates multipliers: "Your transport runs 12% higher than baseline"
- Next estimate adjusts specifically for them
- Shows: "Est. profit: $2,340 (calibrated to your history)"

**Implementation:**

- Table: `deal_outcomes` (user_id, listing_id, purchase/sell prices, actual costs, platform estimates)
- Calculation: `lib/intelligence/dealerCalibration.ts`
- UI: Outcome logging form (simple: 4 fields, 60 seconds)
- Dashboard: "Your Dealer Intelligence" showing calibration progress
- Time: 16 hours

---

#### 10. **Auction Heat Score** (from Booking.com's "X people viewing")

**Value:** Know if this lot will be competitive  
**ROI:** Skip bidding wars, focus on cold lots

**How it works:**

- Track how many dealers saved/viewed this deal
- Calculate: Cold (<3 views), Warm (3-10), Hot (10-20), Bidding War (20+)
- Show on deal card

**Implementation:**

- Table: `deal_views` (user_id, deal_id, viewed_at)
- Aggregate: Count distinct viewers per deal
- UI: Heat badge on deal card
- Privacy: Anonymized count only
- Time: 6 hours

**Phase 3 Total: 22 hours**

---

## Implementation Sequence (Critical Path)

### Week 1: Foundation + Quick Wins

**Day 1-2:** Database setup

- Add columns to `deals` table
- Create `price_alerts`, `saved_searches`, `dealer_deals` tables
- **START price snapshot pg_cron job** (critical: data needs 30 days to mature)

**Day 3-4:** Max Bid Engine + Flash Deal Feed

- API route for max bid calculation
- UI component on deal page
- Flash deals query + tab

**Day 5:** Price Sniper

- Table + background job
- UI button + form

**Week 1 Deliverable:** Dealers can calculate max bids, see flash deals, set price alerts

---

### Week 2: Saved Searches + Polish

**Day 1-3:** Saved Search system

- Table + matching algorithm
- Background job
- UI for creating/managing searches

**Day 4-5:** Polish + notifications

- Email/SMS templates
- Test full pipeline
- Deploy

**Week 2 Deliverable:** Dealers can save search criteria and get automatic alerts

---

### Week 3-4: Outcome Logging (The Lock)

**Day 1-2:** Database + API

- `deal_outcomes` table
- Save/update outcome routes

**Day 3-4:** UI Flow

- "Save this deal" button → saved deals screen
- "Log outcome" form (dead simple)
- Success feedback with comparison

**Day 5:** Notifications

- "Did you buy this car?" reminder (24h after save)
- "Sold yet?" reminder (weekly if purchased)

**Week 3-4 Deliverable:** Dealers can log deal outcomes, system starts learning

---

### Week 5-8: Visual Intelligence (Map + History)

_By now, price snapshots have 30+ days of data_

**Week 5:** Price History + Timing

- Sparkline component
- Market timing badge
- Wire to deal page

**Week 6-7:** Deal Map

- Enable PostGIS in Supabase
- Geocoding worker
- Map UI with Leaflet
- Radius filtering

**Week 8:** Distressed Feed

- Add keyword detection to scraper
- Filter UI
- Test

**Week 5-8 Deliverable:** Dealers see price trends, market timing signals, geographic view

---

### Week 9-12: Compounding Features

**Week 9-10:** Dealer Intelligence Score

- Calibration algorithm
- Dashboard UI showing their accuracy
- Apply multipliers to estimates

**Week 11:** Heat Score

- View tracking
- Aggregate calculation
- Badge UI

**Week 12:** Polish + Analytics

- Admin dashboard showing system-wide accuracy
- Dealer onboarding flow
- Documentation

**Week 9-12 Deliverable:** Full intelligence system live, learning from every dealer

---

## Database Schema (Complete SQL)

### Tables to Create

```sql
-- ============================================================================
-- PHASE 1 TABLES
-- ============================================================================

-- Price Alerts (Sniper)
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Criteria
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_min INT,
  year_max INT,
  target_price NUMERIC(10,2) NOT NULL,
  radius_miles INT DEFAULT 500,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,
  notification_sent BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT price_alerts_user_unique UNIQUE (user_id, make, model, year_min, year_max, target_price)
);

CREATE INDEX idx_price_alerts_active ON price_alerts(active, make, model) WHERE active = TRUE;
CREATE INDEX idx_price_alerts_user ON price_alerts(user_id);


-- Saved Searches
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Naming
  name TEXT NOT NULL DEFAULT 'My search',

  -- Criteria
  makes TEXT[],
  models TEXT[],
  year_min INT,
  year_max INT,
  price_max NUMERIC(10,2),
  min_profit NUMERIC(10,2) DEFAULT 0,
  radius_miles INT DEFAULT 500,
  verdicts TEXT[] DEFAULT ARRAY['GO'],
  body_types TEXT[],
  sources TEXT[],

  -- Behavior
  notify BOOLEAN DEFAULT TRUE,
  last_matched_at TIMESTAMPTZ,
  match_count INT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_active ON saved_searches(user_id, notify) WHERE notify = TRUE;
CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);


-- Dealer Deals (Saved cars + Outcome logging)
CREATE TABLE dealer_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- When saved
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT,
  alert_price NUMERIC(10,2),  -- from price sniper
  search_id UUID REFERENCES saved_searches(id),  -- which search matched

  -- Purchase
  purchased BOOLEAN DEFAULT FALSE,
  purchase_price NUMERIC(10,2),
  purchased_at TIMESTAMPTZ,
  purchase_location TEXT,

  -- Sale
  sold BOOLEAN DEFAULT FALSE,
  sell_price NUMERIC(10,2),
  sold_at TIMESTAMPTZ,
  days_to_sell INT,
  sold_where TEXT,  -- 'lot', 'carmax', 'autotrader', 'private', 'wholesale'

  -- Actual costs
  actual_transport NUMERIC(10,2),
  actual_recon NUMERIC(10,2),
  actual_fees NUMERIC(10,2),
  actual_other_costs NUMERIC(10,2),

  -- Platform estimates (copy from deals at save time)
  platform_est_profit NUMERIC(10,2),
  platform_est_transport NUMERIC(10,2),
  platform_est_recon NUMERIC(10,2),

  -- Calculated
  actual_profit NUMERIC(10,2),  -- sell - purchase - all costs

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT dealer_deals_user_listing UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_dealer_deals_user ON dealer_deals(user_id, saved_at DESC);
CREATE INDEX idx_dealer_deals_purchased ON dealer_deals(user_id, purchased) WHERE purchased = TRUE;
CREATE INDEX idx_dealer_deals_sold ON dealer_deals(user_id, sold) WHERE sold = TRUE;
CREATE INDEX idx_dealer_deals_listing ON dealer_deals(listing_id);


-- ============================================================================
-- PHASE 2 TABLES
-- ============================================================================

-- Vehicle Price Snapshots (for history graph + timing signal)
CREATE TABLE vehicle_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vehicle class
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT NOT NULL,
  state TEXT,  -- optional regional breakdown

  -- Price data
  avg_price NUMERIC(10,2) NOT NULL,
  median_price NUMERIC(10,2),
  min_price NUMERIC(10,2),
  max_price NUMERIC(10,2),
  sample_count INT NOT NULL,

  -- Snapshot metadata
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_filter TEXT,  -- 'retail', 'wholesale', 'all'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_snapshot UNIQUE (make, model, year, state, snapshot_date, source_filter)
);

CREATE INDEX idx_snapshots_lookup ON vehicle_price_snapshots(make, model, year, snapshot_date DESC);
CREATE INDEX idx_snapshots_date ON vehicle_price_snapshots(snapshot_date DESC);


-- Deal Views (for heat score)
CREATE TABLE deal_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  viewed_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT deal_views_unique UNIQUE (user_id, deal_id, viewed_at)
);

CREATE INDEX idx_deal_views_deal ON deal_views(deal_id, viewed_at DESC);
CREATE INDEX idx_deal_views_user ON deal_views(user_id, viewed_at DESC);


-- ============================================================================
-- PHASE 3 TABLES
-- ============================================================================

-- Dealer Calibration (intelligence score)
CREATE TABLE dealer_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Multipliers (learned from outcomes)
  transport_multiplier NUMERIC(5,3) DEFAULT 1.0,  -- their actual / baseline
  recon_multiplier NUMERIC(5,3) DEFAULT 1.0,
  fees_multiplier NUMERIC(5,3) DEFAULT 1.0,

  -- Accuracy metrics
  profit_accuracy_pct NUMERIC(5,2),  -- avg error %
  sample_size INT DEFAULT 0,
  confidence_score NUMERIC(5,2) DEFAULT 0.0,  -- 0-100

  -- Category-specific (optional, advanced)
  category_multipliers JSONB DEFAULT '{}',  -- by make/model/body_type

  -- Metadata
  last_outcome_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT dealer_calibration_user UNIQUE (user_id)
);

CREATE INDEX idx_dealer_calibration_user ON dealer_calibration(user_id);


-- Calibration History (track drift over time)
CREATE TABLE calibration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Snapshot of multipliers
  transport_multiplier NUMERIC(5,3),
  recon_multiplier NUMERIC(5,3),
  profit_accuracy_pct NUMERIC(5,2),
  sample_size INT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT calibration_history_unique UNIQUE (user_id, snapshot_date)
);

CREATE INDEX idx_calibration_history_user ON calibration_history(user_id, snapshot_date DESC);
```

---

### Columns to Add to Existing Tables

```sql
-- Add intelligence columns to deals table
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS flash_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flash_eligible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lat FLOAT8,
  ADD COLUMN IF NOT EXISTS lng FLOAT8,
  ADD COLUMN IF NOT EXISTS distress_signals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heat_score TEXT;  -- 'cold', 'warm', 'hot', 'bidding_war'

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deals_flash ON deals(created_at DESC)
  WHERE deal_verdict = 'GO' AND flash_eligible = TRUE;

CREATE INDEX IF NOT EXISTS idx_deals_geo ON deals USING GIST(ST_MakePoint(lng, lat))
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_distress ON deals USING GIN(distress_signals)
  WHERE array_length(distress_signals, 1) > 0;
```

---

### PostGIS Setup (for Map)

```sql
-- Enable PostGIS extension in Supabase
CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial index already created above (idx_deals_geo)
```

---

### Daily Price Snapshot Job (pg_cron)

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily snapshot job (runs at 2am UTC)
SELECT cron.schedule(
  'daily-price-snapshots',
  '0 2 * * *',  -- 2am daily
  $$
  INSERT INTO vehicle_price_snapshots (make, model, year, state, avg_price, median_price, min_price, max_price, sample_count, source_filter)
  SELECT
    make,
    model,
    year,
    state,
    AVG(price) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price,
    MIN(price) as min_price,
    MAX(price) as max_price,
    COUNT(*) as sample_count,
    'all' as source_filter
  FROM deals
  WHERE created_at > CURRENT_DATE - INTERVAL '1 day'
    AND price IS NOT NULL
    AND price > 0
  GROUP BY make, model, year, state
  HAVING COUNT(*) >= 3  -- need at least 3 samples
  ON CONFLICT (make, model, year, state, snapshot_date, source_filter)
  DO UPDATE SET
    avg_price = EXCLUDED.avg_price,
    median_price = EXCLUDED.median_price,
    min_price = EXCLUDED.min_price,
    max_price = EXCLUDED.max_price,
    sample_count = EXCLUDED.sample_count;
  $$
);

-- Verify it's scheduled
SELECT * FROM cron.job;
```

---

## Code Implementation (Complete Examples)

### 1. Max Bid Engine

**API Route:** `app/api/deal/calculate-max-bid/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { deal_id, target_profit } = body;

  if (!deal_id || !target_profit) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Get the deal
  const { data: deal, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", deal_id)
    .single();

  if (error || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Get dealer's historical cost data
  const { data: outcomes } = await supabase
    .from("dealer_deals")
    .select("actual_transport, actual_recon, actual_fees")
    .eq("user_id", user.id)
    .not("actual_transport", "is", null)
    .order("sold_at", { ascending: false })
    .limit(20);

  // Calculate average actual costs (or use baseline if no history)
  const avgTransport =
    outcomes && outcomes.length > 0
      ? outcomes.reduce((sum, o) => sum + (o.actual_transport || 0), 0) /
        outcomes.length
      : deal.estimated_transport_cost || 450;

  const avgRecon =
    outcomes && outcomes.length > 0
      ? outcomes.reduce((sum, o) => sum + (o.actual_recon || 0), 0) /
        outcomes.length
      : deal.estimated_repair_cost || 580;

  const avgFees =
    outcomes && outcomes.length > 0
      ? outcomes.reduce((sum, o) => sum + (o.actual_fees || 0), 0) /
        outcomes.length
      : 150;

  const platformFee = 25; // your cut

  // THE FORMULA
  const maxBid =
    (deal.sell_estimate || deal.price * 1.3) - // use sell_estimate or fallback
    target_profit -
    avgTransport -
    avgRecon -
    avgFees -
    platformFee;

  const confidence =
    outcomes && outcomes.length > 0
      ? Math.min((outcomes.length / 20) * 100, 100)
      : 50;

  return NextResponse.json({
    deal_id,
    make: deal.make,
    model: deal.model,
    year: deal.year,
    market_price: deal.sell_estimate,
    target_profit,
    estimated_costs: {
      transport: Math.round(avgTransport),
      recon: Math.round(avgRecon),
      fees: Math.round(avgFees),
      platform: platformFee,
      total: Math.round(avgTransport + avgRecon + avgFees + platformFee),
    },
    max_bid: Math.max(0, Math.round(maxBid)),
    confidence_pct: Math.round(confidence),
    message:
      maxBid > 0
        ? `Do not bid above $${Math.round(maxBid).toLocaleString()}. This protects your $${target_profit.toLocaleString()} profit target.`
        : `No profitable bid possible at this target. Lower profit target or skip this deal.`,
    data_source:
      outcomes && outcomes.length > 0
        ? `Based on your last ${outcomes.length} deals`
        : "Based on baseline dealer averages",
  });
}
```

**UI Component:** `components/MaxBidCalculator.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface MaxBidCalculatorProps {
  dealId: string;
  defaultProfit?: number;
}

export function MaxBidCalculator({ dealId, defaultProfit = 2000 }: MaxBidCalculatorProps) {
  const [targetProfit, setTargetProfit] = useState(defaultProfit);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    try {
      const res = await fetch('/api/deal/calculate-max-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: dealId, target_profit: targetProfit }),
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error('Max bid calculation failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-lg">Max Bid Calculator</h3>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Target Profit</label>
        <Input
          type="number"
          value={targetProfit}
          onChange={(e) => setTargetProfit(Number(e.target.value))}
          placeholder="2000"
          className="w-full"
        />
      </div>

      <Button onClick={calculate} disabled={loading} className="w-full">
        {loading ? <Loader2 className="animate-spin" /> : 'Calculate Max Bid'}
      </Button>

      {result && (
        <div className="space-y-3 pt-4 border-t">
          <div className="bg-primary/10 p-4 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Your Maximum Bid</div>
            <div className="text-3xl font-bold text-primary">
              ${result.max_bid.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {result.confidence_pct}% confidence • {result.data_source}
            </div>
          </div>

          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Market Price</span>
              <span className="font-medium">${result.market_price?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transport</span>
              <span>-${result.estimated_costs.transport.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recon</span>
              <span>-${result.estimated_costs.recon.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fees</span>
              <span>-${result.estimated_costs.fees.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Your Profit</span>
              <span>-${result.target_profit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t font-semibold">
              <span>Maximum Bid</span>
              <span className="text-primary">${result.max_bid.toLocaleString()}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic">{result.message}</p>
        </div>
      )}
    </div>
  );
}
```

---

### 2. Price Sniper Background Job

**Worker:** `workers/priceAlertCheck.ts`

```typescript
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { sendSMS } from "@/lib/sms";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function processPriceAlerts() {
  console.log("[PriceAlertCheck] Starting...");

  // Get all active alerts
  const { data: alerts, error: alertsError } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("active", true);

  if (alertsError || !alerts || alerts.length === 0) {
    console.log("[PriceAlertCheck] No active alerts");
    return;
  }

  console.log(`[PriceAlertCheck] Checking ${alerts.length} active alerts`);

  // Get recent deals (last 1 hour)
  const { data: recentDeals, error: dealsError } = await supabase
    .from("deals")
    .select("*")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  if (dealsError || !recentDeals || recentDeals.length === 0) {
    console.log("[PriceAlertCheck] No recent deals to check");
    return;
  }

  console.log(`[PriceAlertCheck] Checking ${recentDeals.length} recent deals`);

  let matchCount = 0;

  // Match deals against alerts
  for (const alert of alerts) {
    for (const deal of recentDeals) {
      // Check if deal matches alert criteria
      const makeMatch = alert.make.toLowerCase() === deal.make?.toLowerCase();
      const modelMatch =
        alert.model.toLowerCase() === deal.model?.toLowerCase();
      const yearMatch =
        (!alert.year_min || deal.year >= alert.year_min) &&
        (!alert.year_max || deal.year <= alert.year_max);
      const priceMatch = deal.price <= alert.target_price;

      if (makeMatch && modelMatch && yearMatch && priceMatch) {
        matchCount++;
        console.log(
          `[PriceAlertCheck] Match! Alert ${alert.id} <> Deal ${deal.id}`,
        );

        // Get user details
        const { data: user } = await supabase.auth.admin.getUserById(
          alert.user_id,
        );

        if (user?.user?.email) {
          // Send notification
          await sendEmail({
            to: user.user.email,
            subject: `🎯 Price Alert: ${deal.year} ${deal.make} ${deal.model} at $${deal.price.toLocaleString()}`,
            html: `
              <h2>Your Price Alert Triggered!</h2>
              <p>A ${deal.year} ${deal.make} ${deal.model} just appeared at <strong>$${deal.price.toLocaleString()}</strong></p>
              <p>Your target was: $${alert.target_price.toLocaleString()}</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/deal/${deal.id}">View Deal →</a></p>
            `,
          });

          // Optional: SMS notification if user has phone
          // await sendSMS(user.phone, `Price alert: ${deal.year} ${deal.make} ${deal.model} at $${deal.price}`);
        }

        // Mark alert as triggered (keep active for future matches)
        await supabase
          .from("price_alerts")
          .update({
            triggered_at: new Date().toISOString(),
            notification_sent: true,
          })
          .eq("id", alert.id);

        // Save deal to user's saved deals
        await supabase.from("dealer_deals").upsert(
          {
            user_id: alert.user_id,
            listing_id: deal.id,
            note: `Matched price alert: ${alert.make} ${alert.model} at $${alert.target_price}`,
            alert_price: alert.target_price,
          },
          {
            onConflict: "user_id,listing_id",
          },
        );
      }
    }
  }

  console.log(`[PriceAlertCheck] Complete. ${matchCount} matches found.`);
}

// Run if called directly
if (require.main === module) {
  processPriceAlerts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[PriceAlertCheck] Error:", error);
      process.exit(1);
    });
}
```

**Schedule:** Add to `workers/index.ts`

```typescript
import { Queue, Worker } from "bullmq";
import { processPriceAlerts } from "./priceAlertCheck";
import { processSavedSearches } from "./savedSearchMatch";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

// Create queue
const intelligenceQueue = new Queue("intelligence", { connection });

// Create worker
const worker = new Worker(
  "intelligence",
  async (job) => {
    console.log(`Processing job: ${job.name}`);

    switch (job.name) {
      case "price-alert-check":
        await processPriceAlerts();
        break;
      case "saved-search-match":
        await processSavedSearches();
        break;
      default:
        console.log(`Unknown job: ${job.name}`);
    }
  },
  { connection },
);

// Schedule jobs
async function scheduleJobs() {
  // Run price alert check every 15 minutes
  await intelligenceQueue.add(
    "price-alert-check",
    {},
    { repeat: { pattern: "*/15 * * * *" } },
  );

  // Run saved search matching every 30 minutes
  await intelligenceQueue.add(
    "saved-search-match",
    {},
    { repeat: { pattern: "*/30 * * * *" } },
  );

  console.log("Intelligence jobs scheduled");
}

scheduleJobs();

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
```

---

### 3. Lightweight Dealer AI

**File:** `lib/intelligence/dealerAI.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface DealerCalibration {
  transportMultiplier: number;
  reconMultiplier: number;
  profitAccuracy: number;
  sampleSize: number;
  confidence: number;
}

/**
 * Calculate dealer-specific calibration based on logged outcomes
 * This is the "AI" - simple statistical learning
 */
export async function getDealerCalibration(
  userId: string,
): Promise<DealerCalibration | null> {
  // Get last 30 logged outcomes
  const { data: outcomes, error } = await supabase
    .from("dealer_deals")
    .select("*")
    .eq("user_id", userId)
    .eq("sold", true)
    .not("actual_profit", "is", null)
    .order("sold_at", { ascending: false })
    .limit(30);

  if (error || !outcomes || outcomes.length < 5) {
    return null; // Not enough data yet
  }

  // Calculate transport multiplier
  const transportOutcomes = outcomes.filter(
    (o) => o.actual_transport && o.platform_est_transport,
  );
  const transportMultiplier =
    transportOutcomes.length > 0
      ? transportOutcomes.reduce(
          (sum, o) => sum + o.actual_transport / o.platform_est_transport,
          0,
        ) / transportOutcomes.length
      : 1.0;

  // Calculate recon multiplier
  const reconOutcomes = outcomes.filter(
    (o) => o.actual_recon && o.platform_est_recon,
  );
  const reconMultiplier =
    reconOutcomes.length > 0
      ? reconOutcomes.reduce(
          (sum, o) => sum + o.actual_recon / o.platform_est_recon,
          0,
        ) / reconOutcomes.length
      : 1.0;

  // Calculate profit accuracy (average % error)
  const profitOutcomes = outcomes.filter(
    (o) => o.actual_profit && o.platform_est_profit,
  );
  const profitAccuracy =
    profitOutcomes.length > 0
      ? profitOutcomes.reduce((sum, o) => {
          const error =
            Math.abs(o.actual_profit - o.platform_est_profit) /
            o.platform_est_profit;
          return sum + error;
        }, 0) / profitOutcomes.length
      : 0.25; // 25% baseline error

  // Confidence score (0-100%)
  const confidence = Math.min((outcomes.length / 30) * 100, 100);

  return {
    transportMultiplier,
    reconMultiplier,
    profitAccuracy,
    sampleSize: outcomes.length,
    confidence,
  };
}

/**
 * Apply calibration to a deal estimate
 */
export async function getCalibratedEstimate(userId: string, deal: any) {
  const calibration = await getDealerCalibration(userId);

  if (!calibration || calibration.sampleSize < 5) {
    // Not enough data, return baseline
    return {
      estimatedProfit: deal.true_net_profit,
      confidence: 50,
      calibrated: false,
      message: "Generic estimate. Log more deals for personalized accuracy.",
    };
  }

  // Adjust costs based on their multipliers
  const adjustedTransport =
    (deal.estimated_transport_cost || 0) * calibration.transportMultiplier;
  const adjustedRecon =
    (deal.estimated_repair_cost || 0) * calibration.reconMultiplier;

  // Recalculate profit
  const calibratedProfit =
    deal.sell_estimate -
    deal.price -
    adjustedTransport -
    adjustedRecon -
    (deal.estimated_fees || 0);

  return {
    estimatedProfit: Math.round(calibratedProfit),
    baselineProfit: deal.true_net_profit,
    adjustments: {
      transport: Math.round(
        adjustedTransport - (deal.estimated_transport_cost || 0),
      ),
      recon: Math.round(adjustedRecon - (deal.estimated_repair_cost || 0)),
    },
    confidence: Math.round(calibration.confidence),
    calibrated: true,
    message: `Calibrated to your history (${calibration.sampleSize} deals, ${Math.round((1 - calibration.profitAccuracy) * 100)}% accurate)`,
    multipliers: {
      transport: calibration.transportMultiplier,
      recon: calibration.reconMultiplier,
    },
  };
}

/**
 * Update dealer calibration record after new outcome
 */
export async function updateDealerCalibration(userId: string) {
  const calibration = await getDealerCalibration(userId);

  if (!calibration) return;

  // Upsert to dealer_calibration table
  await supabase.from("dealer_calibration").upsert(
    {
      user_id: userId,
      transport_multiplier: calibration.transportMultiplier,
      recon_multiplier: calibration.reconMultiplier,
      profit_accuracy_pct: (1 - calibration.profitAccuracy) * 100,
      sample_size: calibration.sampleSize,
      confidence_score: calibration.confidence,
      last_outcome_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    },
  );

  // Also store in history for trend tracking
  await supabase
    .from("calibration_history")
    .insert({
      user_id: userId,
      snapshot_date: new Date().toISOString().split("T")[0],
      transport_multiplier: calibration.transportMultiplier,
      recon_multiplier: calibration.reconMultiplier,
      profit_accuracy_pct: (1 - calibration.profitAccuracy) * 100,
      sample_size: calibration.sampleSize,
    })
    .onConflict("user_id,snapshot_date")
    .ignore();
}
```

---

### 4. Market Timing Signal

**File:** `lib/intelligence/marketTiming.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type TimingSignal = "WAIT" | "BUY_NOW" | "STABLE" | "INSUFFICIENT_DATA";

interface MarketTimingResult {
  signal: TimingSignal;
  trendPct: number;
  message: string;
  confidence: number;
  dataPoints: number;
}

/**
 * Calculate market timing signal for a vehicle class
 * Compares recent 7 days vs 30 days average
 */
export async function getMarketTiming(
  make: string,
  model: string,
  year: number,
  state?: string,
): Promise<MarketTimingResult> {
  // Get last 30 days of snapshots
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const query = supabase
    .from("vehicle_price_snapshots")
    .select("*")
    .eq("make", make)
    .eq("model", model)
    .eq("year", year)
    .gte("snapshot_date", thirtyDaysAgo)
    .order("snapshot_date", { ascending: false });

  if (state) {
    query.eq("state", state);
  }

  const { data: snapshots, error } = await query;

  if (error || !snapshots || snapshots.length < 7) {
    return {
      signal: "INSUFFICIENT_DATA",
      trendPct: 0,
      message: "Not enough historical data yet. Check back in a few weeks.",
      confidence: 0,
      dataPoints: snapshots?.length || 0,
    };
  }

  // Calculate averages
  const last7Days = snapshots.filter((s) => s.snapshot_date >= sevenDaysAgo);
  const last30Days = snapshots;

  const avg7 =
    last7Days.reduce((sum, s) => sum + Number(s.avg_price), 0) /
    last7Days.length;
  const avg30 =
    last30Days.reduce((sum, s) => sum + Number(s.avg_price), 0) /
    last30Days.length;

  const trendPct = ((avg7 - avg30) / avg30) * 100;

  // Determine signal
  let signal: TimingSignal;
  let message: string;

  if (trendPct <= -5) {
    signal = "WAIT";
    message = `Prices dropping ${Math.abs(trendPct).toFixed(1)}%. Wait for bottom.`;
  } else if (trendPct >= 3) {
    signal = "BUY_NOW";
    message = `Prices climbing ${trendPct.toFixed(1)}%. Buy before they rise more.`;
  } else {
    signal = "STABLE";
    message = `Market stable (${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%). Good time to buy.`;
  }

  const confidence = Math.min((snapshots.length / 30) * 100, 100);

  return {
    signal,
    trendPct,
    message,
    confidence,
    dataPoints: snapshots.length,
  };
}

/**
 * Get timing signal with caching
 */
export async function getMarketTimingCached(
  make: string,
  model: string,
  year: number,
  state?: string,
): Promise<MarketTimingResult> {
  // Check if we already calculated this today
  const cacheKey = `timing:${make}:${model}:${year}:${state || "all"}`;
  const today = new Date().toISOString().split("T")[0];

  // TODO: Add Redis caching here if needed
  // For now, calculate fresh each time

  return getMarketTiming(make, model, year, state);
}
```

**UI Component:** `components/MarketTimingBadge.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, Activity } from 'lucide-react';

interface MarketTimingBadgeProps {
  make: string;
  model: string;
  year: number;
  state?: string;
}

export function MarketTimingBadge({ make, model, year, state }: MarketTimingBadgeProps) {
  const [timing, setTiming] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTiming() {
      try {
        const res = await fetch(`/api/intelligence/market-timing?make=${make}&model=${model}&year=${year}&state=${state || ''}`);
        const data = await res.json();
        setTiming(data);
      } catch (error) {
        console.error('Failed to fetch market timing:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchTiming();
  }, [make, model, year, state]);

  if (loading || !timing || timing.signal === 'INSUFFICIENT_DATA') {
    return null;
  }

  const colors = {
    WAIT: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    BUY_NOW: 'bg-green-500/10 text-green-600 border-green-500/20',
    STABLE: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  const icons = {
    WAIT: TrendingDown,
    BUY_NOW: TrendingUp,
    STABLE: Activity,
  };

  const Icon = icons[timing.signal as keyof typeof icons];

  return (
    <Badge variant="outline" className={`${colors[timing.signal as keyof typeof colors]} gap-1.5`}>
      <Icon className="w-3 h-3" />
      <span className="text-xs font-medium">{timing.message}</span>
    </Badge>
  );
}
```

---

### 5. Deal Map with Leaflet

**Page:** `app/(dashboard)/map/page.tsx`

```typescript
'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

// Dynamic import to avoid SSR issues with Leaflet
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function MapPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [radius, setRadius] = useState(200); // miles
  const [center, setCenter] = useState<[number, number]>([39.8283, -98.5795]); // US center
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    fetchDeals();
  }, [radius]);

  async function fetchDeals() {
    setLoading(true);

    // Get deals with coordinates
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('deal_verdict', 'GO')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(500);

    if (!error && data) {
      // Filter by radius client-side (or use PostGIS ST_DWithin for server-side)
      const filtered = data.filter(deal => {
        const distance = calculateDistance(
          center[0], center[1],
          deal.lat, deal.lng
        );
        return distance <= radius;
      });

      setDeals(filtered);
    }

    setLoading(false);
  }

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b space-y-4">
        <h1 className="text-2xl font-bold">Deal Map</h1>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Radius: {radius} miles</label>
            <span className="text-sm text-muted-foreground">{deals.length} deals</span>
          </div>
          <Slider
            value={[radius]}
            onValueChange={(value) => setRadius(value[0])}
            min={50}
            max={500}
            step={50}
            className="w-full"
          />
        </div>
      </div>

      <div className="flex-1">
        <MapView deals={deals} center={center} radius={radius} loading={loading} />
      </div>
    </div>
  );
}
```

**Component:** `components/MapView.tsx`

```typescript
'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';

// Fix Leaflet default icon issue
delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

interface MapViewProps {
  deals: any[];
  center: [number, number];
  radius: number;
  loading: boolean;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function MapView({ deals, center, radius, loading }: MapViewProps) {
  // Color code by profit level
  function getMarkerColor(profit: number): string {
    if (profit >= 3000) return 'green';
    if (profit >= 1500) return 'blue';
    return 'orange';
  }

  return (
    <MapContainer
      center={center}
      zoom={5}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <MapUpdater center={center} />

      {/* OpenStreetMap tiles - FREE */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Radius circle */}
      <Circle
        center={center}
        radius={radius * 1609.34}  // miles to meters
        pathOptions={{
          color: 'blue',
          fillColor: 'blue',
          fillOpacity: 0.1,
        }}
      />

      {/* Deal markers */}
      {deals.map((deal) => (
        <Marker
          key={deal.id}
          position={[deal.lat, deal.lng]}
          icon={new Icon({
            iconUrl: `/markers/${getMarkerColor(deal.true_net_profit)}.png`,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
          })}
        >
          <Popup>
            <div className="space-y-2 min-w-[200px]">
              <h3 className="font-semibold">
                {deal.year} {deal.make} {deal.model}
              </h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">${deal.price.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Profit</span>
                  <span className="font-medium text-green-600">
                    ${deal.true_net_profit.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span>{deal.city}, {deal.state}</span>
                </div>
              </div>
              <Link
                href={`/deal/${deal.id}`}
                className="block w-full text-center bg-primary text-primary-foreground py-1.5 rounded text-sm font-medium hover:bg-primary/90"
              >
                View Deal
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}

      {loading && (
        <div className="absolute top-4 right-4 bg-white px-4 py-2 rounded-lg shadow-lg z-[1000]">
          Loading deals...
        </div>
      )}
    </MapContainer>
  );
}
```

---

### 6. Outcome Logging Flow

**Component:** `components/OutcomeLogger.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface OutcomeLoggerProps {
  dealId: string;
  make: string;
  model: string;
  year: number;
  platformEstimate: number;
  onComplete?: () => void;
}

export function OutcomeLogger({
  dealId,
  make,
  model,
  year,
  platformEstimate,
  onComplete,
}: OutcomeLoggerProps) {
  const [step, setStep] = useState<'purchase' | 'sale'>('purchase');
  const [formData, setFormData] = useState({
    purchased: false,
    purchasePrice: '',
    sold: false,
    sellPrice: '',
    actualTransport: '',
    actualRecon: '',
    actualFees: '',
    soldWhere: 'lot',
    daysToSell: '',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit() {
    setLoading(true);

    try {
      const actualProfit = formData.sold
        ? Number(formData.sellPrice) -
          Number(formData.purchasePrice) -
          Number(formData.actualTransport || 0) -
          Number(formData.actualRecon || 0) -
          Number(formData.actualFees || 0)
        : null;

      const res = await fetch('/api/outcomes/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: dealId,
          purchased: true,
          purchase_price: Number(formData.purchasePrice),
          sold: formData.sold,
          sell_price: formData.sold ? Number(formData.sellPrice) : null,
          actual_transport: Number(formData.actualTransport) || null,
          actual_recon: Number(formData.actualRecon) || null,
          actual_fees: Number(formData.actualFees) || null,
          sold_where: formData.soldWhere,
          days_to_sell: formData.sold ? Number(formData.daysToSell) : null,
          actual_profit: actualProfit,
          platform_est_profit: platformEstimate,
        }),
      });

      if (!res.ok) throw new Error('Failed to log outcome');

      const result = await res.json();

      if (result.calibration) {
        toast({
          title: formData.sold ? '🎉 Deal Logged!' : '✅ Purchase Logged',
          description: formData.sold
            ? `Actual profit: $${actualProfit?.toLocaleString()}. Platform estimated: $${platformEstimate.toLocaleString()}. ${result.calibration.message}`
            : 'Come back after you sell it to complete the outcome.',
        });
      }

      onComplete?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to log outcome. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  if (step === 'purchase') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-lg mb-2">
            Did you buy this {year} {make} {model}?
          </h3>
          <p className="text-sm text-muted-foreground">
            Platform estimated ${platformEstimate.toLocaleString()} profit
          </p>
        </div>

        <div className="space-y-2">
          <Label>What did you pay?</Label>
          <Input
            type="number"
            placeholder="9200"
            value={formData.purchasePrice}
            onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              setFormData({ ...formData, purchased: true });
              setStep('sale');
            }}
            disabled={!formData.purchasePrice}
            className="flex-1"
          >
            Yes, I bought it
          </Button>
          <Button variant="outline" onClick={onComplete} className="flex-1">
            Not yet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-lg mb-2">Have you sold it yet?</h3>
        <p className="text-sm text-muted-foreground">
          You bought it for ${Number(formData.purchasePrice).toLocaleString()}
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Sell Price</Label>
          <Input
            type="number"
            placeholder="12400"
            value={formData.sellPrice}
            onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Transport Cost</Label>
            <Input
              type="number"
              placeholder="450"
              value={formData.actualTransport}
              onChange={(e) => setFormData({ ...formData, actualTransport: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Recon Cost</Label>
            <Input
              type="number"
              placeholder="580"
              value={formData.actualRecon}
              onChange={(e) => setFormData({ ...formData, actualRecon: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Other Fees</Label>
            <Input
              type="number"
              placeholder="150"
              value={formData.actualFees}
              onChange={(e) => setFormData({ ...formData, actualFees: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Days to Sell</Label>
            <Input
              type="number"
              placeholder="14"
              value={formData.daysToSell}
              onChange={(e) => setFormData({ ...formData, daysToSell: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Where did you sell it?</Label>
          <Select value={formData.soldWhere} onValueChange={(v) => setFormData({ ...formData, soldWhere: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lot">My Lot</SelectItem>
              <SelectItem value="carmax">CarMax</SelectItem>
              <SelectItem value="autotrader">AutoTrader</SelectItem>
              <SelectItem value="private">Private Party</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => {
            setFormData({ ...formData, sold: true });
            handleSubmit();
          }}
          disabled={!formData.sellPrice || loading}
          className="flex-1"
        >
          {loading ? 'Saving...' : 'Log Complete Deal'}
        </Button>
        <Button
          variant="outline"
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1"
        >
          {loading ? 'Saving...' : 'Just Log Purchase'}
        </Button>
      </div>
    </div>
  );
}
```

---

## Free Map Stack (Zero Cost)

### Why Free Matters

Paid map APIs (Google Maps, Mapbox) cost $200-2000/month at scale. This free stack delivers the same functionality at $0.

### Stack Components

| Component         | Purpose                    | Cost | Limit                        |
| ----------------- | -------------------------- | ---- | ---------------------------- |
| **Leaflet.js**    | Map rendering              | FREE | Unlimited                    |
| **OpenStreetMap** | Map tiles                  | FREE | Unlimited (just attribution) |
| **Nominatim**     | Geocoding (city → lat/lng) | FREE | 1 request/second             |
| **PostGIS**       | Spatial queries            | FREE | Built into Supabase          |

### Setup

1. **Leaflet already installed** (in package.json)
2. **Enable PostGIS in Supabase:**

   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

3. **Nominatim geocoding with rate limiting:**

   ```typescript
   // lib/geocoding.ts
   import pLimit from "p-limit";

   const limit = pLimit(1); // 1 request/second for Nominatim

   export async function geocodeLocation(
     city: string,
     state: string,
   ): Promise<{ lat: number; lng: number } | null> {
     return limit(async () => {
       const url =
         `https://nominatim.openstreetmap.org/search?` +
         `city=${encodeURIComponent(city)}&` +
         `state=${encodeURIComponent(state)}&` +
         `country=USA&` +
         `format=json&` +
         `limit=1`;

       const res = await fetch(url, {
         headers: {
           "User-Agent": "DealerHunt/1.0 (contact@dealerhunt.com)", // Required by Nominatim
         },
       });

       const data = await res.json();
       if (data && data.length > 0) {
         return {
           lat: parseFloat(data[0].lat),
           lng: parseFloat(data[0].lon),
         };
       }

       return null;
     });
   }
   ```

4. **Background job to geocode deals:**

   ```typescript
   // workers/geocodeListing.ts
   import { createClient } from "@supabase/supabase-js";
   import { geocodeLocation } from "@/lib/geocoding";

   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_ROLE_KEY!,
   );

   export async function geocodeUncodedListings() {
     // Get deals without coordinates
     const { data: deals } = await supabase
       .from("deals")
       .select("id, city, state")
       .is("lat", null)
       .not("city", "is", null)
       .not("state", "is", null)
       .limit(50); // Process 50 per run

     if (!deals || deals.length === 0) return;

     console.log(`Geocoding ${deals.length} listings...`);

     for (const deal of deals) {
       try {
         const coords = await geocodeLocation(deal.city, deal.state);

         if (coords) {
           await supabase
             .from("deals")
             .update({
               lat: coords.lat,
               lng: coords.lng,
               geocoded_at: new Date().toISOString(),
             })
             .eq("id", deal.id);

           console.log(`✓ Geocoded ${deal.city}, ${deal.state}`);
         }
       } catch (error) {
         console.error(`Failed to geocode ${deal.city}, ${deal.state}:`, error);
       }

       // Rate limit: 1/second
       await new Promise((resolve) => setTimeout(resolve, 1000));
     }
   }
   ```

5. **PostGIS radius query (for map filtering):**
   ```sql
   -- Find all deals within 200 miles of a point
   SELECT
     id, year, make, model, price, true_net_profit,
     lat, lng, city, state,
     ST_Distance(
       ST_MakePoint(lng, lat)::geography,
       ST_MakePoint(-98.5795, 39.8283)::geography  -- center point
     ) / 1609.34 AS distance_miles
   FROM deals
   WHERE
     lat IS NOT NULL
     AND lng IS NOT NULL
     AND deal_verdict = 'GO'
     AND ST_DWithin(
       ST_MakePoint(lng, lat)::geography,
       ST_MakePoint(-98.5795, 39.8283)::geography,
       321869  -- 200 miles in meters
     )
   ORDER BY distance_miles ASC
   LIMIT 500;
   ```

**Total Cost: $0/month**

---

## Pricing Strategy (How to Monetize)

### Free Tier (Hook them)

- Browse all listings
- Price Sniper (3 alerts max)
- Saved Searches (3 max)
- Deal Map
- Flash Deal Feed
- Market Timing Signal
- No credit card required

**Purpose:** Get dealers using it, see the value, understand the system

---

### Pro Tier ($29/month)

**Unlock:**

- Unlimited Price Alerts
- Unlimited Saved Searches
- Outcome Logging enabled
- Calibration Dashboard ("Your Dealer Intelligence")
- Source ROI Dashboard (which sources make you money)
- Personalized profit predictions
- Priority support

**Value Proposition:** "After 20 deals, your estimates will be 6% more accurate than generic tools. That's $1,000+ extra profit per year. Pay $348/year, make $1,000+ more."

---

### Pro Plus ($79/month)

**Everything in Pro, plus:**

- Predictive Alerts ("This market category is heating up")
- Competitor Benchmarking (anonymized: "You're top 15% in your region")
- Cost Optimization Alerts ("Your recon costs jumped 18% this month")
- Pricing Strategy Recommendations ("Sell this $400 higher than usual")
- Quarterly Market Reports (PDF)
- White-glove onboarding

**Value Proposition:** "For dealers doing 30+ deals/month. Extra intelligence worth $3,000-5,000/year in margin improvements."

---

### Enterprise (Custom)

**Everything in Pro Plus, plus:**

- DMS Integration (auto-import sales from CDK/Reynolds/etc)
- Multi-user accounts (whole dealership)
- White-label option
- Custom market reports
- Dedicated account manager
- Historical data export

**Pricing:** $299-999/month depending on dealership size

---

### The Lock-In Progression

**Week 1:** Dealer signs up free, saves 5 deals, sets 2 price alerts  
**Week 2:** Gets alert, buys a car using max bid calculator  
**Week 3:** Notification: "Did you buy that car? Log the outcome"  
**Week 4:** Logs first outcome, sees: "You beat our estimate by 11%"  
**Week 5-8:** Logs 3 more outcomes, dashboard shows improving calibration  
**Month 2:** System says "You're 73% calibrated. Upgrade to Pro for unlimited alerts and personalized estimates."  
**Month 3:** They upgrade because they've made $2,000 extra from better bidding  
**Month 6:** 30 logged deals, 94% calibration, they're locked in forever

---

## Success Metrics (How to Track)

### KPIs to Watch

**User Activation:**

- % of signups who save their first deal (target: 60%)
- % who set a price alert (target: 40%)
- % who log their first outcome (target: 25%)

**Engagement:**

- Weekly active users (WAU)
- Avg deals saved per user per month (target: 8-12)
- Avg outcomes logged per user per month (target: 2-4)

**Monetization:**

- Free → Pro conversion rate (target: 15-20% after 10 logged outcomes)
- Pro → Pro Plus upgrade rate (target: 10%)
- Monthly churn (target: <3%)

**Data Quality:**

- % of deals geocoded (target: 90%+)
- Days of price history accumulated (target: 90+ days)
- % of dealers with 20+ logged outcomes (target: 30% of Pro users)

**Platform Intelligence:**

- System-wide profit estimate accuracy (target: 85%+)
- % of dealers with 90%+ calibration (target: 40% of Pro users after 6 months)
- Avg profit improvement per deal vs baseline (target: $300-500)

### Dashboard SQL Queries

```sql
-- User activation funnel
WITH funnel AS (
  SELECT
    COUNT(DISTINCT user_id) as total_signups,
    COUNT(DISTINCT CASE WHEN has_saved_deal THEN user_id END) as saved_deal,
    COUNT(DISTINCT CASE WHEN has_alert THEN user_id END) as set_alert,
    COUNT(DISTINCT CASE WHEN has_outcome THEN user_id END) as logged_outcome
  FROM (
    SELECT
      u.id as user_id,
      EXISTS(SELECT 1 FROM dealer_deals dd WHERE dd.user_id = u.id) as has_saved_deal,
      EXISTS(SELECT 1 FROM price_alerts pa WHERE pa.user_id = u.id) as has_alert,
      EXISTS(SELECT 1 FROM dealer_deals dd WHERE dd.user_id = u.id AND dd.sold = true) as has_outcome
    FROM auth.users u
    WHERE u.created_at > NOW() - INTERVAL '30 days'
  ) stats
)
SELECT
  total_signups,
  saved_deal,
  ROUND(saved_deal::numeric / total_signups * 100, 1) as saved_deal_pct,
  set_alert,
  ROUND(set_alert::numeric / total_signups * 100, 1) as set_alert_pct,
  logged_outcome,
  ROUND(logged_outcome::numeric / total_signups * 100, 1) as logged_outcome_pct
FROM funnel;


-- Platform intelligence metrics
SELECT
  COUNT(DISTINCT user_id) as calibrated_dealers,
  AVG(profit_accuracy_pct) as avg_accuracy,
  AVG(sample_size) as avg_logged_deals,
  COUNT(*) FILTER (WHERE confidence_score >= 90) as fully_calibrated
FROM dealer_calibration
WHERE sample_size >= 5;


-- Revenue metrics (if tracking subscriptions)
SELECT
  COUNT(*) FILTER (WHERE tier = 'pro') as pro_users,
  COUNT(*) FILTER (WHERE tier = 'pro_plus') as pro_plus_users,
  SUM(CASE
    WHEN tier = 'pro' THEN 29
    WHEN tier = 'pro_plus' THEN 79
    ELSE 0
  END) as mrr
FROM user_subscriptions
WHERE status = 'active';
```

---

## Risk Mitigation

### Technical Risks

**Risk:** Nominatim rate limit (1 req/sec) too slow for bulk geocoding  
**Mitigation:** Run geocoding job continuously in background. After 30 days, 95% of listings will be geocoded. For urgent geocoding, cache common city/state pairs.

**Risk:** Price snapshot job fails, no historical data  
**Mitigation:** Monitor pg_cron job daily. Add alerting if last snapshot >48h old. Keep raw scrape data as backup.

**Risk:** Scraper changes break intelligence features  
**Mitigation:** Intelligence features read from `deals` table, not scraper directly. As long as deals populate, features work.

**Risk:** Calibration algorithm overfits to outliers  
**Mitigation:** Limit to last 30 outcomes, exclude outliers >3σ from mean, require minimum 5 outcomes before applying.

---

### Business Risks

**Risk:** Dealers don't log outcomes  
**Mitigation:**

- Send reminder notifications (24h, 7d, 14d, 30d after save)
- Show comparison: "You've logged 8 deals. Dealers who log 20+ make $4k more per year"
- Gamify: "You're 73% calibrated. 7 more deals to 100%"

**Risk:** Free tier users never upgrade  
**Mitigation:**

- Hard limit: 3 price alerts, 3 saved searches on free
- After 10 outcomes, show: "Upgrade to see your full calibration"
- Surface Pro features in UI with "Pro" badges

**Risk:** Churn after 1-2 months  
**Mitigation:**

- Email campaign: quarterly market reports, seasonal buying tips
- Feature drops: "New: Distressed Inventory Feed"
- Personalized: "You haven't logged a deal in 30 days. Everything ok?"

**Risk:** Competitors copy features  
**Mitigation:**

- Data moat is the real lock (they can't copy your 6 months of outcomes)
- Network effects: more dealers = better calibration for everyone
- Speed: ship fast, iterate, stay ahead

---

## Next Steps (Start Today)

### Immediate Actions (Today)

1. **Run the SQL migrations** from the Database Schema section
2. **Start the price snapshot pg_cron job** (data needs 30 days to mature)
3. **Test geocoding** on 10 sample deals
4. **Set up BullMQ worker** for price alerts and saved searches

### This Week

1. **Build Max Bid Engine** (4 hours)
   - API route
   - UI component on deal page
   - Test with real deals

2. **Build Flash Deal Feed** (4 hours)
   - Query logic
   - UI tab
   - Background job to mark eligible deals

3. **Build Price Sniper** (6 hours)
   - Database table
   - Background job
   - UI button + form
   - Email/SMS notifications

4. **Build Saved Search Alerts** (8 hours)
   - Database table
   - Matching algorithm
   - Background job
   - UI for creating/managing

**Week 1 Deliverable:** Dealers can calculate max bids, see flash deals, set price alerts, save search criteria

### Week 2-3

1. **Build Outcome Logging** (16 hours)
   - Database table
   - API routes
   - UI flow (save → purchase → sell)
   - Notifications

2. **Build Dealer AI** (8 hours)
   - Calibration algorithm
   - Apply to estimates
   - Dashboard UI

**Week 2-3 Deliverable:** Dealers can log outcomes, system starts learning

### Week 4-8 (After 30 days of price data)

1. **Build Price History + Timing** (10 hours)
2. **Build Deal Map** (12 hours)
3. **Build Distressed Feed** (3 hours)
4. **Polish + Testing** (10 hours)

**Week 4-8 Deliverable:** Full intelligence system live

---

## Questions & Answers

**Q: Do I need machine learning / data science expertise?**  
A: No. The "AI" is just statistical averages and multipliers. It's 200 lines of TypeScript.

**Q: What if dealers don't log outcomes?**  
A: Start with 10 pilot dealers who you can personally onboard. Get them logging. Use their data to prove the system works. Then scale.

**Q: How do I compete with CarGurus/Manheim?**  
A: You're not competing on volume of listings. You're competing on intelligence. They show listings. You show "this is the right deal for YOU at the right time with the right bid."

**Q: What if a dealer uses this to find deals but never pays?**  
A: That's fine. They're generating data. After 6 months, you have enough data that paid users get significantly better intelligence. Free users feed the system, paid users benefit most.

**Q: How long until this pays off?**  
A: Phase 1 (max bid, sniper, flash deals) delivers value day 1. Outcome logging pays off after dealers log 10-20 deals (2-3 months). Data moat pays off after 6-12 months.

**Q: Should I charge from day 1?**  
A: No. Let first 100-500 dealers use free to build data. Then introduce Pro tier. Early adopters get lifetime discount as thank you.

---

## Final Blueprint Summary

### What You're Building

A profit intelligence platform that gets smarter the longer dealers use it.

### Why It Works

1. **Immediate value:** Max bid calculator, price alerts, flash deals work day 1
2. **Compounding intelligence:** Every logged outcome makes system smarter
3. **Personalization:** After 30 deals, estimates are calibrated to THEM
4. **Data moat:** After 6 months, you have proprietary market data worth more than the features
5. **Switching cost:** Leaving means losing personalized accuracy worth $1,000s/year

### What Makes It Different

**CarGurus:** Browse listings  
**DealerHunt Pro:** Active intelligence that learns you

### The Math

- Dealer does 40 deals/year
- Without DealerHunt: $72k profit
- With DealerHunt: $80k profit (+$8k)
- Cost: $348/year (Pro tier)
- ROI: 23x

### The Lock

After 30 logged deals, they can't leave. Their personalized calibration is worth too much.

### Time to Revenue

- Month 1-2: Build Phase 1 + Phase 2
- Month 3: First outcomes logged
- Month 4: Calibration dashboard shows value
- Month 5: Introduce Pro tier
- Month 6: 15-20% of active users upgrade
- Month 12: Data moat established, platform gets better every day

---

## Ready to Build?

Drop this document into Claude Code, point it at your workspace, and say:

> "Implement Phase 1 features from INTELLIGENCE-EXPANSION-BLUEPRINT.md. Start with database schema, then Max Bid Engine, then Price Sniper. Use existing stack (Supabase, Next.js, BullMQ). Test each feature before moving to next."

**Or break it down step by step:**

> "Create the price_alerts, saved_searches, and dealer_deals tables from the blueprint. Run migrations and verify they exist."

> "Build the Max Bid Engine API route and UI component from the blueprint. Test with deal ID xyz."

> "Build the Price Sniper background job and notification system from the blueprint."

The blueprint is complete. Everything is specified. Now it's execution time.

---

**Questions?** Re-read sections as needed. Everything is here.  
**Stuck?** Each feature can be built independently. Start with Max Bid Engine (simplest) to build confidence.  
**Timeline?** Phase 1 = 1-2 weeks. Phase 2 = 3-4 weeks (mostly waiting for data). Phase 3 = 2-3 weeks.

**Total implementation time: 8-12 weeks from start to fully intelligent platform.**

Go build it. 🚀
