# DealerHunt Pro - Path to 100% Ready

**Three Launch Tiers:** Soft Launch → Public Beta → Production Ready

---

## 🎯 Tier 1: SOFT LAUNCH (Show to 5 Dealers) - 2 Days

**Goal:** App doesn't look broken, numbers are believable, can collect feedback

### Critical Fixes (Must Have)

- [ ] **Start FlareSolverr** (5 min)

  ```bash
  docker run -d --name flaresolverr --restart always \
    -p 8191:8191 -e LOG_LEVEL=warn \
    ghcr.io/flaresolverr/flaresolverr:latest
  echo 'FLARESOLVERR_URL=http://localhost:8191' >> .env.local
  ```

- [ ] **Update DealCard for image proxy** (15 min)
  - Find: `components/shared/DealCard.tsx`
  - Wrap image URLs: `/api/image/proxy?url=${encodeURIComponent(imageUrl)}`
  - Add error fallback to placeholder

- [ ] **Run rescore on all deals** (30 min)

  ```bash
  # Fix existing bad data
  for i in {0..20}; do
    curl -X POST http://localhost:3000/api/admin/rescore \
      -H "Authorization: Bearer $INGEST_SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"page\": $i, \"pageSize\": 100}"
    sleep 5
  done
  ```

- [ ] **Add placeholder images** (10 min)
  - Create: `public/images/car-placeholder.jpg`
  - Use when image fails to load

- [ ] **Test all 4 scrapers produce data** (30 min)

  ```bash
  npm run worker scrape:craigslist
  npm run worker scrape:cars_com
  npm run worker scrape:cargurus
  npm run worker scrape:autotrader

  # Check results
  psql $DATABASE_URL -c "SELECT source, COUNT(*) FROM deals WHERE active = true GROUP BY source;"
  ```

### Nice to Have (Polish)

- [ ] Loading states on all pages
- [ ] Error boundaries for graceful failures
- [ ] Toast notifications for actions
- [ ] Mobile responsive check (test on phone)

**Timeline:** 4-6 hours  
**Success:** 5 dealers say "this looks real" and give feature feedback

---

## 🚀 Tier 2: PUBLIC BETA (Charge Money) - 2-3 Weeks

**Goal:** 20-50 dealers paying $29/mo, app is stable, core features work

### Authentication & Billing (Must Have)

- [ ] **Stripe integration working** (1 day)
  - [ ] Add Stripe env vars to Vercel
  - [ ] Test checkout flow (sandbox mode)
  - [ ] Webhook handling for subscription events
  - [ ] Cancel/upgrade flows
  - [ ] Invoice generation

- [ ] **Subscription tiers enforced** (1 day)
  - [ ] Free: 20 deals/day limit
  - [ ] Pro ($29/mo): Unlimited deals + alerts
  - [ ] Elite ($79/mo): Auction Co-Pilot (when ready)
  - [ ] Paywall UI on scan page

- [ ] **Email verification** (4 hours)
  - [ ] Resend integration tested
  - [ ] Welcome email template
  - [ ] Password reset flow
  - [ ] Billing notification emails

### Core Features Complete (Must Have)

- [ ] **Max Bid Calculator UI** (1 day)
  - Component shows `recommendedMaxBid` from backend
  - Editable inputs (adjust transport, repair costs)
  - Live recalculation
  - Location: Deal detail page

- [ ] **Saved Searches + Alerts** (2 days)
  - [ ] UI to create/edit saved searches
  - [ ] Email alerts when matches found
  - [ ] SMS alerts (optional, Twilio)
  - [ ] Alert frequency settings
  - [ ] Unsubscribe links

- [ ] **Deal IQ Display** (1 day)
  - [ ] IQ score chip on cards (already exists?)
  - [ ] Breakdown modal (why this score?)
  - [ ] Color coding (green=90+, yellow=70-89, red=<70)

- [ ] **Market Timing Badge** (1 day)
  - [ ] Read from `market_timing_signals` view
  - [ ] Display on deal cards
  - [ ] "🔥 Hot market" / "❄️ Cooling off" indicators

### Data Quality (Must Have)

- [ ] **Duplicate detection working** (validate)
  - Check: No same VIN with multiple active listings
  - Fix: Dedup logic in scraper pipeline

- [ ] **Price sanity checks** (1 day)
  - [ ] Flag deals with ask_price < $500 (likely errors)
  - [ ] Flag deals with ask_price > $200K (exotics/errors)
  - [ ] Flag `priceImplausible` deals (already in analyzer)
  - [ ] Hide flagged deals from /scan by default

- [ ] **Geographic data** (2 days)
  - [ ] Build geocoding worker (Nominatim)
  - [ ] Backfill lat/lng for existing deals
  - [ ] Location-based filtering (radius search)
  - [ ] User location preference storage

### Performance & Reliability (Must Have)

- [ ] **Database indexes** (1 day)

  ```sql
  CREATE INDEX idx_deals_active_verdict ON deals(active, deal_verdict);
  CREATE INDEX idx_deals_make_model_year ON deals(make, model, year);
  CREATE INDEX idx_deals_location ON deals(location_state);
  CREATE INDEX idx_deals_profit ON deals(true_net_profit DESC);
  CREATE INDEX idx_deals_created ON deals(created_at DESC);
  ```

- [ ] **Caching strategy** (1 day)
  - [ ] SWR revalidation intervals set correctly
  - [ ] API routes return proper cache headers
  - [ ] Market aggregates cached (1 hour TTL)

- [ ] **Error monitoring** (4 hours)
  - [ ] Sentry or similar integrated
  - [ ] Error tracking on API routes
  - [ ] Frontend error boundaries
  - [ ] Scraper failure alerts

- [ ] **Rate limiting** (4 hours)
  - [ ] API routes limited (100 req/min per user)
  - [ ] Scraper throttling (respect site limits)
  - [ ] Email alerts limited (max 10/hour)

### UI/UX Polish (Nice to Have)

- [ ] Onboarding flow for new users
- [ ] Tutorial tooltips on first visit
- [ ] Dark mode toggle (if not default)
- [ ] Keyboard shortcuts for power users
- [ ] Export deals to CSV
- [ ] Print deal detail pages

**Timeline:** 2-3 weeks  
**Success:** 20 dealers paying, <5% churn, stable performance

---

## 💎 Tier 3: PRODUCTION READY (Scale to 200 Dealers) - 6-9 Weeks

**Goal:** All promised features work, outcome calibration live, $10K MRR

### The Moat (Must Have - This is Your Defensibility)

- [ ] **Outcome Logging System** (1 week)

  ```sql
  CREATE TABLE dealer_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    deal_id UUID REFERENCES deals(id),

    -- Purchase
    purchased BOOLEAN DEFAULT FALSE,
    purchase_price NUMERIC(10,2),
    purchase_date DATE,

    -- Sale
    sold BOOLEAN DEFAULT FALSE,
    sell_price NUMERIC(10,2),
    sell_date DATE,
    days_to_sell INT,

    -- Costs
    actual_transport NUMERIC(10,2),
    actual_recon NUMERIC(10,2),
    actual_fees NUMERIC(10,2),

    -- Comparison
    platform_est_profit NUMERIC(10,2),
    actual_profit NUMERIC(10,2),

    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
  - [ ] Dead-simple logging UI (<60 seconds to complete)
  - [ ] API endpoints: POST /api/dealer/deals, PATCH /api/dealer/deals/:id
  - [ ] "Did you buy this?" reminder emails
  - [ ] Mobile-friendly (dealers log from phone)

- [ ] **Calibration System** (1 week)

  ```sql
  CREATE TABLE dealer_calibration (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),

    transport_multiplier NUMERIC(5,3) DEFAULT 1.0,
    recon_multiplier NUMERIC(5,3) DEFAULT 1.0,

    profit_accuracy_pct NUMERIC(5,2),
    sample_size INT DEFAULT 0,
    confidence_score NUMERIC(5,2) DEFAULT 0,

    last_updated TIMESTAMPTZ DEFAULT NOW()
  );
  ```
  - [ ] Algorithm: Compare predicted vs actual after 10+ outcomes
  - [ ] Compute multipliers: `actual_avg / predicted_avg`
  - [ ] Integrate into `deal-analyzer.ts` (apply multipliers)
  - [ ] Dashboard showing accuracy: "Your predictions are 92% accurate"

- [ ] **Dealer Profiles** (3 days)

  ```sql
  CREATE TABLE dealer_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),

    business_name TEXT,
    home_state TEXT DEFAULT 'TX',
    lot_size INT,

    baseline_transport NUMERIC(10,2),
    baseline_recon NUMERIC(10,2),
    baseline_fees NUMERIC(10,2),
    target_roi NUMERIC(5,3) DEFAULT 0.20,

    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
  - [ ] Onboarding collects: location, typical costs, target ROI
  - [ ] Editable in settings
  - [ ] Used as defaults in deal analyzer

### Auction Co-Pilot (Must Have - Tier Differentiator)

- [ ] **Run List Upload** (2 days)
  - [ ] POST /api/auction/run-list
  - [ ] Parse CSV or line-separated VINs
  - [ ] Store in `auction_run_lists` table
  - [ ] Trigger overnight batch job

- [ ] **Batch Analysis Job** (2 days)
  - [ ] BullMQ job processes entire run list
  - [ ] Pre-fetch VIN decodes, comps, valuations
  - [ ] Cache results for offline access
  - [ ] Email when complete: "Your 247 VINs are ready"

- [ ] **Lane Mode UI** (3 days)
  - [ ] Fullscreen, minimal chrome
  - [ ] VIN input (barcode scanner or manual)
  - [ ] Instant lookup from cache (<1 sec)
  - [ ] Large text: GO/HOLD, Max Bid $XX,XXX
  - [ ] Swipe gestures (next/previous)
  - [ ] Works offline (Service Worker)

- [ ] **VIN Barcode Scanner** (2 days)
  - [ ] Use device camera (Web API)
  - [ ] Barcode detection library
  - [ ] Extract VIN from Code 39/128
  - [ ] Fallback to manual entry

- [ ] **Offline Support** (2 days)
  - [ ] Service Worker caches analyzed deals
  - [ ] IndexedDB for local storage
  - [ ] Sync when connection returns
  - [ ] "Offline mode" indicator

### Additional Data Sources (Nice to Have)

- [ ] **Facebook Marketplace scraper** (1 week)
- [ ] **OfferUp scraper** (3 days)
- [ ] **Copart auction scraper** (1 week)
- [ ] **IAA auction scraper** (1 week)

### Analytics & Admin (Must Have)

- [ ] **Admin Dashboard** (1 week)
  - [ ] Total deals by source
  - [ ] Scraper health monitoring
  - [ ] User growth charts
  - [ ] MRR tracking
  - [ ] Churn analysis

- [ ] **User Analytics** (3 days)
  - [ ] Track: searches, deal views, saves, outcomes
  - [ ] Identify power users
  - [ ] Feature usage heatmap
  - [ ] Conversion funnel (free → paid)

### Legal & Compliance (Must Have Before Scale)

- [ ] **Terms of Service** (1 day)
- [ ] **Privacy Policy** (1 day)
- [ ] **GDPR compliance** (2 days)
  - [ ] Data export feature
  - [ ] Account deletion
  - [ ] Cookie consent
- [ ] **DMCA agent registration** (if hosting images)

**Timeline:** 6-9 weeks  
**Success:** 200 dealers, $10K MRR, <3% churn, outcome calibration working

---

## 📊 Feature Completion Matrix

| Feature               | Soft Launch         | Public Beta | Production |
| --------------------- | ------------------- | ----------- | ---------- |
| Deal search/filtering | 80%                 | 95%         | 100%       |
| Profit calculations   | 90%                 | 95%         | 100%       |
| Image loading         | 50%                 | 100%        | 100%       |
| Max bid calculator    | 0% (backend ready)  | 100%        | 100%       |
| Saved searches        | 60% (table exists)  | 100%        | 100%       |
| Email alerts          | 40%                 | 100%        | 100%       |
| Deal IQ display       | 70%                 | 100%        | 100%       |
| Market timing         | 50% (data exists)   | 100%        | 100%       |
| Outcome logging       | 0%                  | 0%          | 100%       |
| Calibration           | 0%                  | 0%          | 100%       |
| Auction Co-Pilot      | 0%                  | 0%          | 100%       |
| Geographic filtering  | 30% (PostGIS ready) | 80%         | 100%       |
| Stripe billing        | 0%                  | 100%        | 100%       |
| Mobile responsive     | 70%                 | 90%         | 100%       |
| Offline support       | 0%                  | 0%          | 80%        |

---

## 🛠️ Technical Debt to Address

### High Priority (Do Before Scale)

- [ ] **Database connection pooling** (check Supabase limits)
- [ ] **Image storage strategy** (currently hotlinking, need CDN?)
- [ ] **API response times** (should be <500ms p95)
- [ ] **Scraper error recovery** (retry logic, dead letter queue)
- [ ] **Background job monitoring** (BullMQ dashboard)

### Medium Priority

- [ ] TypeScript strict mode enabled
- [ ] API route tests (Jest)
- [ ] Component tests (React Testing Library)
- [ ] E2E tests (Playwright)
- [ ] Storybook for UI components

### Low Priority (Post-Launch)

- [ ] Code splitting for faster loads
- [ ] Image optimization (next/image)
- [ ] Bundle size analysis
- [ ] Lighthouse score >90

---

## 🚨 Blockers to Address Immediately

### Showstoppers (Can't Launch Without)

1. **FlareSolverr not running** → Only 10% of deal volume
2. **Stripe not configured** → Can't charge money
3. **Images don't load** → App looks broken (fixed, needs deployment)
4. **Wrong profit numbers** → Dealers lose money (fixed, needs rescore)

### High Risk (Could Kill Growth)

1. **No outcome logging** → No moat, competitors copy features
2. **Auction Co-Pilot missing** → Elite tier has no value prop
3. **Slow performance** → Dealers get frustrated
4. **No email alerts** → Core Pro tier feature missing

### Medium Risk (Hurts But Not Fatal)

1. **Limited data sources** → Need 4+ sources minimum
2. **No geographic filtering** → Dealers see irrelevant deals
3. **Poor mobile experience** → 50% of traffic on mobile
4. **No onboarding** → Users don't know what to do

---

## 📅 Recommended Roadmap

### Week 1: SOFT LAUNCH READY

**Focus:** Fix bugs, make app credible

- Day 1-2: FlareSolverr + image proxy + rescore
- Day 3-4: Test all scrapers, validate data
- Day 5: Show to 5 dealers, collect feedback

### Week 2-3: PUBLIC BETA READY

**Focus:** Core features + billing

- Week 2: Stripe integration, max bid UI, saved searches
- Week 3: Email alerts, geographic filtering, polish

### Week 4-5: FEATURE COMPLETE

**Focus:** Auction Co-Pilot (make-or-break)

- Week 4: Run list upload, batch analysis, Lane Mode UI
- Week 5: VIN scanner, offline support, dealer testing

### Week 6-7: THE MOAT

**Focus:** Outcome logging + calibration

- Week 6: Database tables, logging UI, API endpoints
- Week 7: Calibration algorithm, dashboard, integration

### Week 8-9: SCALE READY

**Focus:** Performance, monitoring, admin tools

- Week 8: Indexes, caching, error monitoring
- Week 9: Admin dashboard, analytics, legal docs

---

## ✅ Definition of "100% Ready"

### Soft Launch (Show to Dealers)

- ✅ App doesn't crash
- ✅ Images load
- ✅ Profit numbers believable
- ✅ 500+ deals from multiple sources
- ✅ Mobile works (basic responsiveness)

### Public Beta (Charge Money)

- ✅ All above +
- ✅ Stripe checkout works
- ✅ Email alerts send
- ✅ Max bid calculator visible
- ✅ Saved searches functional
- ✅ Error monitoring active
- ✅ 1,000+ deals from 4+ sources

### Production (Scale to 200 Dealers)

- ✅ All above +
- ✅ Outcome logging works (<60 sec to log)
- ✅ Calibration computes after 10 outcomes
- ✅ Auction Co-Pilot ships (Elite tier value)
- ✅ Performance <500ms p95
- ✅ Uptime >99.5%
- ✅ Admin dashboard for monitoring
- ✅ Legal docs (TOS, Privacy)
- ✅ 5,000+ deals from 6+ sources

---

## 🎯 Your Next Actions (In Order)

### Today (4-6 hours)

1. [ ] Start FlareSolverr (5 min)
2. [ ] Update DealCard for image proxy (15 min)
3. [ ] Run rescore on all deals (30 min)
4. [ ] Test all 4 scrapers (30 min)
5. [ ] Validate data quality (1 hour)
6. [ ] Mobile responsive check (1 hour)

### Tomorrow (6-8 hours)

1. [ ] Add placeholder images
2. [ ] Create Stripe account + get API keys
3. [ ] Build max bid calculator UI
4. [ ] Add indexes to database
5. [ ] Set up error monitoring (Sentry free tier)

### This Week

1. [ ] Stripe checkout flow working
2. [ ] Email alerts sending
3. [ ] Saved searches UI complete
4. [ ] Geographic filtering working
5. [ ] Show to 5 dealers

### Next 2 Weeks

1. [ ] Auction Co-Pilot design + validation
2. [ ] Start building run list upload
3. [ ] Lane Mode UI prototype
4. [ ] Get 20 dealers on beta waitlist

---

## 💰 Budget Required (Optional Upgrades)

**Current:** ~$50/mo (Supabase + Vercel + OpenAI)

**For scale:**

- Sentry error monitoring: $26/mo (up to 50K errors)
- Upstash Redis (caching): $10/mo
- CDN for images: $5-20/mo
- Email (Resend): Free tier OK until 500 dealers

**Total at 200 dealers:** ~$80-100/mo

---

## 🎉 Success Metrics

### Soft Launch

- 5 dealers say "I'd pay for this"
- 500+ deals visible
- No major bugs reported

### Public Beta

- 20 paying dealers ($580 MRR)
- <10% churn
- 1,000+ deals from 4 sources

### Production

- 200 paying dealers ($10K MRR)
- <5% churn
- 50+ dealers logging outcomes
- Auction Co-Pilot used at real auctions

---

**Bottom line:** You need:

- **2 days** for soft launch (bug fixes only)
- **2-3 weeks** for public beta (billing + core features)
- **6-9 weeks** for production (moat + scale features)

**Start with the 3 bug fixes today. Then decide: Quick soft launch or jump to public beta?**
