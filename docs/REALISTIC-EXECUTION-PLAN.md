# DealerHunt Pro - Realistic Execution Plan
## Based on Actual Codebase State + Revolutionary Blueprint

**Date:** June 23, 2026  
**Reality Check:** What works, what's broken, what to build, in what order

---

## Current State (Honest Assessment)

### ✅ What Actually Works

1. **Scraping Infrastructure**
   - Craigslist scraper: WORKING (producing real data)
   - Pipeline structure: EXISTS (normalize → score → upsert)
   - 6 scraper types built: Cheerio, TLS, Patchright, FlareSolverr, Camoufox, AI rescue
   - Status: Only Craigslist producing data, rest dormant

2. **Profit Calculation**
   - `deal-analyzer.ts`: WORKING
   - Calculates: BUY, REPAIR, TRANSPORT, SELL, PROFIT, ROI
   - Has `recommendedMaxBid` built-in
   - GO/HOLD/PASS verdict system
   - Status: Logic works, values sometimes wrong (comps issue)

3. **Intelligence Modules**
   - Deal IQ scoring: EXISTS
   - Win patterns: EXISTS
   - Days on market: EXISTS
   - Mispricing detection: EXISTS
   - Status: Built but disconnected from UI

4. **Database**
   - PostgreSQL with PostGIS: ENABLED
   - Tables exist: deals, user_saved_searches, market_aggregates, flash_deals_tracking
   - pgvector enabled: READY
   - Status: Schema 70% complete

5. **Frontend**
   - Next.js 15 + React: WORKING
   - Dark UI with amber accents: LOOKS GOOD
   - Deal cards, scan page, saved searches: FUNCTIONAL
   - Status: UI exists but shows wrong data

6. **External Services**
   - Resend (email): CONNECTED
   - Twilio (SMS): CONNECTED
   - Leaflet/React-Leaflet: INSTALLED
   - Status: Integrated but underutilized

### ❌ What's Broken

1. **Valuation is Wrong**
   - Shelby GT500 polluting Mustang comps (high-end outlier breaks median)
   - Circular markup fallback (ask × 1.25) when comps missing
   - No outlier filtering in `market-value.ts`
   - **Impact:** GO verdicts on money-losing deals

2. **sell_estimate Not Written Back**
   - Rescore updates `true_net_profit` but not `sell_estimate`
   - Cards read `sellEstimate` from DB for IQ chip
   - If DB has stale values, IQ shows wrong
   - **Impact:** IQ 92 on every card (using wrong data)

3. **Images Don't Load**
   - Craigslist blocks hotlinks
   - No image proxy route
   - Cards show broken image icons
   - **Impact:** App looks unprofessional

4. **Empty State Shows Developer Commands**
   - "Run npm run worker" visible to users
   - Shows terminal commands instead of friendly message
   - **Impact:** Confusing, looks broken

5. **Scrapers Dormant**
   - FlareSolverr not running (simple Docker command missing)
   - Cars.com, CarGurus, AutoTrader = 0 data
   - Only Craigslist working
   - **Impact:** 10% of potential deal volume

6. **No Outcome Logging**
   - Dealers can't log what they bought/sold
   - No calibration possible
   - Intelligence doesn't improve over time
   - **Impact:** No moat, no personalization

7. **No Location Awareness**
   - Can't filter by user location + radius
   - No geographic arbitrage detection
   - Transport costs not personalized
   - **Impact:** Dealers see irrelevant deals

8. **Stripe Can't Process Payments**
   - Code scaffolded but env vars missing
   - No products created in Stripe
   - Webhooks not configured
   - **Impact:** Can't monetize

---

## The Revolutionary Plan (8 Phases)

From the blueprint session, here's what would transform this into a $2.5M ARR business:

### Phase 0: Fix Core Bugs (This Week)
**Goal:** Make what exists actually work

1. Fix valuation (outlier rejection in comps)
2. Fix sell_estimate write-back 
3. Add image proxy
4. Replace empty state
5. Start FlareSolverr
6. Add missing env vars

**Time:** 2-3 days  
**Impact:** App stops looking broken

### Phase 1: Auction Co-Pilot (Week 2-3)
**Goal:** Instant decisions at auction

**The Feature:**
- Dealer uploads auction run list night before
- System pre-caches + analyzes every VIN overnight
- At auction: scan VIN → 3-second GO/HOLD with max bid
- Works offline (cached data)

**What to Build:**
- Run list upload endpoint
- Overnight batch analysis job
- Stripped-down "Lane Mode" UI
- VIN barcode scanner (Web API)
- Offline caching (Service Worker)

**Time:** 2 weeks  
**Impact:** Elite tier ($79/mo) sells itself

### Phase 2: Private Seller Radar (Week 4-5)
**Goal:** Find deals before they hit market

**The Feature:**
- Real-time monitoring: Craigslist, Facebook, OfferUp
- Match against dealer's saved searches
- Instant alert when motivated seller posts
- AI negotiation brief per deal

**What to Build:**
- Real-time scrape triggers (not daily batch)
- Seller motivation detection (price drops, urgency keywords)
- AI negotiation coach (GPT-4 prompt)
- Push notification system

**Time:** 2 weeks  
**Impact:** Dealers get first-mover advantage

### Phase 3: Outcome Logging + Calibration (Week 6-7)
**Goal:** System learns from each dealer

**The Feature:**
- Dead-simple outcome logging (4 fields, 60 seconds)
- Automatic calibration after 10 logged deals
- Personalized profit predictions
- "Your accuracy: 94%" dashboard

**What to Build:**
- `dealer_deals` table
- `dealer_calibration` table
- Outcome logging UI
- Calibration algorithm
- Integrate multipliers into `deal-analyzer.ts`

**Time:** 2 weeks  
**Impact:** The moat begins

### Phase 4: Floorplan Intelligence (Week 8-9)
**Goal:** Stop losing money on aged inventory

**The Feature:**
- Dealer logs their floored inventory
- Daily carrying cost calculator
- "Sell now" alerts when car crosses profit threshold
- Wholesale vs retail decision support

**What to Build:**
- `dealer_inventory` table
- Carrying cost calculator
- Alert system for aged units
- Pricing recommendations

**Time:** 2 weeks  
**Impact:** Replaces $1,500/mo vAuto subscription

### Phase 5: Recon Marketplace (Month 3)
**Goal:** Crowdsourced local shop intelligence

**The Feature:**
- Dealers log actual recon costs by shop
- Database of shop performance + pricing
- Shop directory with dealer ratings
- Referral revenue from shops

**What to Build:**
- `recon_shops` table
- `recon_jobs` table
- Shop directory UI
- Referral tracking
- Revenue split automation

**Time:** 3 weeks  
**Impact:** New revenue stream ($25-200 per job)

### Phase 6: Network Flywheel (Month 4)
**Goal:** Every dealer makes every dealer smarter

**The Feature:**
- Anonymous outcome sharing (opt-in)
- 30-day forward scout (predictive inventory)
- Source ROI leaderboard
- Market timing alerts

**What to Build:**
- Anonymized data aggregation
- Trend detection algorithms
- Market intelligence dashboard
- Automated insights generation

**Time:** 3 weeks  
**Impact:** Network effects kick in

### Phase 7: Geographic Arbitrage (Month 5)
**Goal:** Buy cheap in one market, sell high in another

**The Feature:**
- "This F-150 is $4,200 cheaper in Alabama than Texas"
- Transport cost factored automatically
- Net arbitrage profit shown
- State-by-state inventory heat maps

**What to Build:**
- State-level price aggregation
- Arbitrage calculator
- Geographic heat maps
- Transport integration

**Time:** 2 weeks  
**Impact:** Unique feature no competitor has

### Phase 8: Data Contracts (Year 2)
**Goal:** Monetize the transaction database

**The Feature:**
- 500+ dealers logging 2 years of real data
- Most accurate indie dealer transaction DB in existence
- Sell access to lenders, insurers, OEMs
- $50K-500K per contract

**What to Build:**
- Data export APIs
- Anonymization layer
- Contract management
- Usage tracking

**Time:** Ongoing  
**Impact:** $2.5M ARR territory

---

## Platform Decision: PWA vs Native App

### The Answer: Mobile-First PWA (No Native App Needed)

**Why PWA:**
- Works on iOS + Android + Desktop from one codebase
- Can be "installed" to home screen
- Offline capability (Service Workers)
- Push notifications (Web Push API)
- Camera access for VIN scanner (Web API)
- GPS for location (Geolocation API)
- 0% app store fees
- Instant updates (no app store approval)

**What You Already Have:**
- Next.js 15 (perfect for PWA)
- `manifest.json` exists
- Service Worker scaffolded
- Responsive UI already built

**What to Add:**
```javascript
// public/manifest.json (enhance existing)
{
  "name": "DealerHunt Pro",
  "short_name": "DealerHunt",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#f59e0b",
  "background_color": "#18181b",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "start_url": "/scan",
  "categories": ["business", "productivity"]
}
```

**When to Build Native:**
- 5,000+ MAU
- Need push notifications on iOS (Web Push doesn't work on iOS yet)
- Need deep integrations (Apple CarPlay, Android Auto)
- Have a team to maintain 3 codebases

**For now:** PWA is perfect. Revisit in 12 months.

---

## Data & Tools Needed

### New Database Tables

```sql
-- 1. Dealer deals (outcome logging)
CREATE TABLE dealer_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID NOT NULL REFERENCES deals(id),
  
  -- Purchase
  purchased BOOLEAN DEFAULT FALSE,
  purchase_price NUMERIC(10,2),
  purchase_date DATE,
  
  -- Sale
  sold BOOLEAN DEFAULT FALSE,
  sell_price NUMERIC(10,2),
  sell_date DATE,
  days_to_sell INT,
  
  -- Actual costs
  actual_transport NUMERIC(10,2),
  actual_recon NUMERIC(10,2),
  actual_fees NUMERIC(10,2),
  
  -- Platform estimates (for comparison)
  platform_est_profit NUMERIC(10,2),
  platform_est_transport NUMERIC(10,2),
  platform_est_recon NUMERIC(10,2),
  
  -- Calculated
  actual_profit NUMERIC(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Dealer calibration (learned multipliers)
CREATE TABLE dealer_calibration (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  
  transport_multiplier NUMERIC(5,3) DEFAULT 1.0,
  recon_multiplier NUMERIC(5,3) DEFAULT 1.0,
  
  profit_accuracy_pct NUMERIC(5,2),
  sample_size INT DEFAULT 0,
  confidence_score NUMERIC(5,2) DEFAULT 0,
  
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Dealer inventory (floorplan tracking)
CREATE TABLE dealer_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID REFERENCES deals(id),
  
  vin TEXT NOT NULL,
  year INT,
  make TEXT,
  model TEXT,
  
  purchased_price NUMERIC(10,2),
  purchase_date DATE,
  
  floored BOOLEAN DEFAULT FALSE,
  floor_apr NUMERIC(5,3),
  floor_start_date DATE,
  
  list_price NUMERIC(10,2),
  days_in_inventory INT,
  
  status TEXT DEFAULT 'active', -- active, sold, wholesaled
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Recon shops
CREATE TABLE recon_shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  specialty TEXT, -- body, mechanical, detailing, glass
  
  address TEXT,
  city TEXT,
  state TEXT,
  
  avg_rating NUMERIC(3,2),
  job_count INT DEFAULT 0,
  
  referral_fee_pct NUMERIC(5,2) DEFAULT 15.0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Recon jobs (for marketplace)
CREATE TABLE recon_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  dealer_id UUID NOT NULL REFERENCES auth.users(id),
  shop_id UUID REFERENCES recon_shops(id),
  inventory_id UUID REFERENCES dealer_inventory(id),
  
  job_type TEXT, -- body, paint, mechanical, detailing
  cost NUMERIC(10,2),
  days_to_complete INT,
  
  dealer_rating INT, -- 1-5
  dealer_note TEXT,
  
  referral_fee NUMERIC(10,2),
  
  completed_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Auction run lists (pre-cache)
CREATE TABLE auction_run_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  auction_name TEXT,
  auction_date DATE,
  
  vins TEXT[],
  cached_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. User location preferences
CREATE TABLE user_location_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  
  home_lat FLOAT8,
  home_lng FLOAT8,
  home_city TEXT,
  home_state TEXT,
  
  default_radius_miles INT DEFAULT 150,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Market intelligence cache
CREATE TABLE market_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  
  avg_days_to_sell INT,
  price_trend_7d NUMERIC(5,2), -- % change
  price_trend_30d NUMERIC(5,2),
  
  inventory_velocity TEXT, -- hot, warm, cold
  
  computed_at DATE DEFAULT CURRENT_DATE,
  
  UNIQUE(make, model, computed_at)
);

-- 9. Dealer network outcomes (anonymous sharing)
CREATE TABLE network_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Anonymized
  region TEXT, -- "Southwest", "Southeast"
  
  make TEXT,
  model TEXT,
  year INT,
  
  buy_price NUMERIC(10,2),
  sell_price NUMERIC(10,2),
  recon_cost NUMERIC(10,2),
  days_to_sell INT,
  
  profit NUMERIC(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Free APIs & Services ($0/month)

| Service | Purpose | Limit | Cost |
|---------|---------|-------|------|
| **Nominatim** | Geocoding (address → coordinates) | 1 req/sec | FREE |
| **ip-api.com** | User location by IP | 1000 req/min | FREE |
| **OpenStreetMap** | Map tiles | Unlimited | FREE |
| **NHTSA** | VIN decode | 1 req/sec | FREE |
| **Browser APIs** | GPS, Camera, Offline, Push | N/A | FREE |

### Paid Services (Current Stack)

| Service | Purpose | Current Cost |
|---------|---------|--------------|
| **Supabase Pro** | Database + Auth + Storage | $25/mo |
| **Vercel Pro** | Hosting + Edge Functions | $20/mo |
| **Resend** | Email | Free tier (3K/mo) |
| **Twilio** | SMS | Pay per use |
| **OpenAI** | AI features | ~$5-10/mo |

**Total: ~$50/mo** (scales with usage)

### What to Add

**For Phase 1-2:**
- FlareSolverr (Docker, $0)
- Service Worker for offline
- Web Push for notifications

**For Phase 3-4:**
- Stripe account + products
- BullMQ for background jobs (already have)

**For Phase 5-6:**
- Nothing new (use existing stack)

---

## Architecture (How It All Fits)

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                            │
├─────────────────────────────────────────────────────────────┤
│ Craigslist  Cars.com  CarGurus  Facebook  IAA  Copart      │
│     ↓          ↓         ↓         ↓       ↓      ↓         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    SCRAPING LAYER                            │
├─────────────────────────────────────────────────────────────┤
│ Cheerio → TLS → Patchright → FlareSolverr → Camoufox       │
│                              ↓                               │
│                     AI Rescue (fallback)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   PROCESSING PIPELINE                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Normalize → 2. Decode VIN → 3. Analyze (profit calc)    │
│ 4. Dedupe → 5. Score → 6. Match alerts → 7. Upsert DB      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (Supabase)                       │
├─────────────────────────────────────────────────────────────┤
│ deals  dealer_deals  dealer_calibration  dealer_inventory   │
│ recon_shops  recon_jobs  market_intelligence                │
│ user_saved_searches  auction_run_lists  network_outcomes    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    API LAYER (Next.js)                       │
├─────────────────────────────────────────────────────────────┤
│ /api/scan         → Deal search with filters                │
│ /api/deal/:id     → Single deal details                     │
│ /api/dealer/deals → Outcome logging                         │
│ /api/calibrate    → Compute multipliers                     │
│ /api/inventory    → Floorplan tracking                      │
│ /api/recon        → Shop marketplace                        │
│ /api/intelligence → Market insights                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND (Next.js 15)                       │
├─────────────────────────────────────────────────────────────┤
│ /scan       → Main deal search (location-aware)             │
│ /deal/[id]  → Deal details + IQ + max bid calculator        │
│ /saved      → Saved deals + outcome logging                 │
│ /lane       → Auction Co-Pilot (offline, fast)              │
│ /inventory  → Floorplan manager                             │
│ /intelligence → Calibration dashboard + network insights    │
│ /recon      → Shop directory                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Realistic Timeline

| Phase | Weeks | What Ships | Revenue Impact |
|-------|-------|------------|----------------|
| **Phase 0** | 1 | Bugs fixed, app credible | $0 (foundation) |
| **Phase 1** | 2-3 | Auction Co-Pilot | Elite tier launches ($79/mo) |
| **Phase 2** | 2 | Private Seller Radar | First $10K MRR |
| **Phase 3** | 2 | Outcome logging + calibration | The moat |
| **Phase 4** | 2 | Floorplan intelligence | $20K MRR |
| **Phase 5** | 3 | Recon marketplace | New revenue stream |
| **Phase 6** | 3 | Network flywheel | $50K MRR |
| **Phase 7** | 2 | Geographic arbitrage | Unique advantage |
| **Phase 8** | Ongoing | Data contracts | $2.5M ARR |

**Total to Phase 6:** ~15 weeks (3.5 months)  
**To $2.5M ARR:** 18-24 months

---

## Critical Success Factors

### What Must Happen

1. **Week 1:** Fix the 6 core bugs
   - Without this, nothing else matters
   - App must look real and numbers must be accurate

2. **Week 2-3:** Ship Auction Co-Pilot
   - This is the killer feature
   - Dealers either buy it or they don't
   - If they don't buy this, nothing else will convert them

3. **Month 2:** Get 50 dealers logging outcomes
   - Without outcome data, calibration is a promise not a product
   - The moat doesn't exist until dealers are feeding it data

4. **Month 3-4:** Referral revenue working
   - Prove the business model isn't just subscriptions
   - Recon marketplace must generate cash

5. **Month 6:** Network effects visible
   - 200+ dealers sharing outcomes
   - Predictions provably better than generic tools
   - Word of mouth accelerating

### What Could Kill This

1. **Valuation stays wrong** → Dealers lose money on "GO" deals → They leave and tell everyone
2. **Auction Co-Pilot is slow** → 3 seconds becomes 30 seconds → Dealers don't use it
3. **No outcome logging** → No moat → Competitors copy the features → You have no advantage
4. **Can't monetize** → Stripe issues → Burn cash → Die

---

## Next Steps (Immediate)

### Today (Do This Right Now)

1. **Check deal count:**
   ```sql
   SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE active = true) as active,
          COUNT(*) FILTER (WHERE deal_verdict = 'go') as go_deals
   FROM deals;
   ```
   If zero, scraper isn't running.

2. **Start FlareSolverr:**
   ```bash
   docker run -d --restart always -p 8191:8191 \
     -e LOG_LEVEL=warn \
     ghcr.io/flaresolverr/flaresolverr:latest
   ```
   Then add to `.env.local`:
   ```
   FLARESOLVERR_URL=http://localhost:8191
   ```

3. **Add missing env vars to Vercel:**
   - `OPENAI_API_KEY`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `RESEND_API_KEY`
   - `CRON_SECRET`

### Tomorrow (Phase 0 Day 1)

1. Fix sell_estimate write-back in rescore
2. Add image proxy route
3. Fix outlier rejection in market-value.ts
4. Replace empty state component

### This Week (Phase 0 Complete)

- All 6 core bugs fixed
- App looks real
- Numbers are accurate
- Ready to show dealers

### Next Week (Phase 1 Start)

- Begin Auction Co-Pilot development
- Design Lane Mode UI
- Build run list upload
- Set up offline caching

---

## The Bottom Line

**What works:** Strong foundation (70% of backend, scraping infrastructure, intelligence modules)

**What's broken:** Valuation bugs, missing UI, scrapers dormant, no monetization

**The plan:** 8 phases, 15 weeks to network flywheel, 24 months to $2.5M ARR

**Platform:** Mobile-first PWA (no native app needed until 5K MAU)

**Cost:** $50/mo infrastructure (everything else is free)

**The moat:** Outcome calibration + network effects + transaction database

**First milestone:** 50 dealers paying $29-79/mo by month 2 = $2.9K MRR

**Make or break moment:** Auction Co-Pilot in week 3. If dealers don't use it at auction, pivot immediately.

**Start with:** The 6 bugs in Phase 0. Nothing else matters until those work.

---

This is the plan. Not aspirational. Realistic. Based on what exists and what dealers actually need.
