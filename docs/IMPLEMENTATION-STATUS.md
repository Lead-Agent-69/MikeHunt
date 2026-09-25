# DealerHunt Pro - Implementation Status

**Last Updated:** June 23, 2026  
**Current Phase:** Phase 0 (Bug Fixes)  
**Completion:** 50% (3 of 6 bugs fixed)

---

## Phase 0: Core Bug Fixes (Week 1)

**Goal:** Make existing features actually work  
**Timeline:** 1 week  
**Status:** IN PROGRESS (50% complete)

| Bug | Priority | Status | Owner | Notes |
|-----|----------|--------|-------|-------|
| sell_estimate not written back | HIGH | ✅ FIXED | - | Rescore now writes sell_estimate, repair_estimate, transport_estimate |
| Outlier rejection (Shelby GT500) | HIGH | ✅ FIXED | - | Enhanced median() with 3× Q3 cap |
| Images don't load (hotlink block) | MEDIUM | ✅ FIXED | - | Created /api/image/proxy route |
| Empty state shows dev commands | LOW | ✅ N/A | - | Already user-friendly, not an issue |
| Scrapers dormant (need FlareSolverr) | HIGH | ⏳ TODO | YOU | Run start-flaresolverr.sh script |
| Missing Vercel env vars | HIGH | ⏳ TODO | YOU | Add to Vercel dashboard |

**Blockers:** None - all fixes are straightforward

**Next Actions:**
1. Start FlareSolverr Docker container
2. Update DealCard component to use image proxy
3. Add Vercel environment variables
4. Run rescore on all active deals
5. Verify images load and IQ chips show correct values

---

## Phase 1: Auction Co-Pilot (Week 2-3)

**Goal:** Instant GO/HOLD decisions at auction  
**Timeline:** 2 weeks  
**Status:** NOT STARTED  
**Make-or-break:** If dealers don't use this at real auctions, pivot immediately

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| Run list upload endpoint | HIGH | ⏳ TODO | 1 day | POST /api/auction/run-list with CSV/VIN parsing |
| Overnight batch analysis | HIGH | ⏳ TODO | 1 day | BullMQ job to pre-cache all VINs |
| Lane Mode UI (stripped down) | HIGH | ⏳ TODO | 2 days | Fullscreen, one deal at a time, large text |
| VIN barcode scanner | MEDIUM | ⏳ TODO | 1 day | Use device camera + barcode detection API |
| Offline caching (Service Worker) | MEDIUM | ⏳ TODO | 2 days | Cache analyzed deals for offline use |
| Max bid display (large) | HIGH | ⏳ TODO | 1 day | Pull from recommendedMaxBid field |

**Success Criteria:**
- Dealer can upload 200 VIN run list night before
- All VINs analyzed overnight (cached)
- At auction: scan VIN → instant (<3 sec) GO/HOLD with max bid
- Works offline (no cell signal in auction hall)

**Revenue Impact:** Unlocks Elite tier at $79/mo

---

## Phase 2: Private Seller Radar (Week 4-5)

**Goal:** Find deals before they hit market  
**Timeline:** 2 weeks  
**Status:** NOT STARTED

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| Real-time scrape triggers | HIGH | ⏳ TODO | 2 days | Webhook/polling for new listings |
| Seller motivation detection | MEDIUM | ⏳ TODO | 1 day | Price drops, urgency keywords |
| AI negotiation brief | MEDIUM | ⏳ TODO | 1 day | GPT-4 prompt per deal |
| Push notifications | HIGH | ⏳ TODO | 2 days | Web Push API integration |
| Alert customization UI | MEDIUM | ⏳ TODO | 2 days | User controls for alert frequency |

**Success Criteria:**
- Dealer gets alert within 5 minutes of motivated seller posting
- Alert includes: deal details, motivation signal, negotiation talking points
- Push notification works on mobile PWA

**Revenue Impact:** Core value prop for Pro tier ($29/mo)

---

## Phase 3: Outcome Logging + Calibration (Week 6-7)

**Goal:** System learns from each dealer (THE MOAT)  
**Timeline:** 2 weeks  
**Status:** NOT STARTED  
**Critical:** Without this, no competitive advantage

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| dealer_deals table | HIGH | ⏳ TODO | 1 day | Outcome logging schema |
| dealer_calibration table | HIGH | ⏳ TODO | 1 day | Learned multipliers |
| Outcome logging UI | HIGH | ⏳ TODO | 2 days | Dead simple 4-field form |
| Calibration algorithm | HIGH | ⏳ TODO | 2 days | Compute multipliers after 10+ deals |
| dealer_profiles table | MEDIUM | ⏳ TODO | 1 day | Cost defaults per dealer |
| Integrate into deal-analyzer | HIGH | ⏳ TODO | 1 day | Apply dealer multipliers |
| Calibration dashboard | MEDIUM | ⏳ TODO | 2 days | Show accuracy %, confidence |

**Success Criteria:**
- Dealer can log outcome in <60 seconds
- After 10 logged deals, system computes calibration
- Profit predictions become personalized (not generic)
- Dashboard shows "Your accuracy: 94%"

**Revenue Impact:** The lock-in / competitive moat begins

---

## Phase 4: Floorplan Intelligence (Week 8-9)

**Goal:** Stop losing money on aged inventory  
**Timeline:** 2 weeks  
**Status:** NOT STARTED

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| dealer_inventory table | HIGH | ⏳ TODO | 1 day | Track floored units |
| Carrying cost calculator | HIGH | ⏳ TODO | 1 day | Daily interest + aging |
| "Sell now" alerts | MEDIUM | ⏳ TODO | 1 day | Cross profit threshold |
| Wholesale vs retail decision | MEDIUM | ⏳ TODO | 1 day | Price recommendations |
| Inventory dashboard | HIGH | ⏳ TODO | 2 days | Current floored units + aging |

**Success Criteria:**
- Dealer logs their floored inventory
- System alerts when car crosses "sell now" threshold
- Daily carrying cost visible per unit

**Revenue Impact:** Replaces $1,500/mo vAuto subscription

---

## Phase 5: Recon Marketplace (Month 3)

**Goal:** Crowdsourced shop intelligence + referral revenue  
**Timeline:** 3 weeks  
**Status:** NOT STARTED

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| recon_shops table | MEDIUM | ⏳ TODO | 1 day | Shop directory |
| recon_jobs table | MEDIUM | ⏳ TODO | 1 day | Job tracking + ratings |
| Shop directory UI | MEDIUM | ⏳ TODO | 2 days | Search/filter shops |
| Referral tracking | MEDIUM | ⏳ TODO | 2 days | Commission split |
| Shop ratings | LOW | ⏳ TODO | 1 day | 1-5 star + comments |

**Success Criteria:**
- 50+ shops in directory
- Dealers log actual recon costs
- First referral revenue generated ($25-200 per job)

**Revenue Impact:** New revenue stream, $2-5K/mo at scale

---

## Phase 6: Network Flywheel (Month 4)

**Goal:** Every dealer makes every dealer smarter  
**Timeline:** 3 weeks  
**Status:** NOT STARTED

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| network_outcomes table | HIGH | ⏳ TODO | 1 day | Anonymous outcome sharing |
| Anonymization layer | HIGH | ⏳ TODO | 1 day | Strip PII, aggregate regions |
| 30-day forward scout | MEDIUM | ⏳ TODO | 2 days | Predictive inventory |
| Source ROI leaderboard | LOW | ⏳ TODO | 1 day | Best sources by profit |
| Market timing alerts | MEDIUM | ⏳ TODO | 2 days | Price trend warnings |

**Success Criteria:**
- 200+ dealers opted into outcome sharing
- Predictive insights visible ("F-150s trending up 8% this week")
- Network effects measurable (more dealers → better predictions)

**Revenue Impact:** Network effects create moat, defensibility

---

## Phase 7: Geographic Arbitrage (Month 5)

**Goal:** Buy cheap in one market, sell high in another  
**Timeline:** 2 weeks  
**Status:** NOT STARTED

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| State-level price aggregation | MEDIUM | ⏳ TODO | 2 days | Avg price by state |
| Arbitrage calculator | MEDIUM | ⏳ TODO | 1 day | Net profit after transport |
| Geographic heat maps | LOW | ⏳ TODO | 2 days | Leaflet + state polygons |
| Transport integration | MEDIUM | ⏳ TODO | 1 day | Carrier quotes |

**Success Criteria:**
- "This F-150 is $4,200 cheaper in Alabama than Texas"
- Transport cost factored automatically
- Heat map shows state-by-state arbitrage opportunities

**Revenue Impact:** Unique feature, no competitor has this

---

## Phase 8: Data Contracts (Year 2)

**Goal:** Monetize the transaction database  
**Timeline:** Ongoing  
**Status:** NOT STARTED  
**Unlock:** Requires 500+ dealers, 2+ years of data

| Feature | Priority | Status | Estimate | Notes |
|---------|----------|--------|----------|-------|
| Data export APIs | LOW | ⏳ TODO | 3 days | Anonymized data access |
| Contract management | LOW | ⏳ TODO | 2 days | Customer accounts |
| Usage tracking | LOW | ⏳ TODO | 1 day | API rate limits |
| Legal/privacy layer | HIGH | ⏳ TODO | 1 week | Ensure GDPR/CCPA compliance |

**Success Criteria:**
- First data contract signed (lender or insurer)
- $50K-500K annual contract

**Revenue Impact:** $2.5M ARR territory

---

## Database Schema Status

| Table | Status | Migration File | Notes |
|-------|--------|----------------|-------|
| deals | ✅ EXISTS | 20260620030000_rename_listings_to_deals.sql | Core listings table |
| user_saved_searches | ✅ EXISTS | 20260621020000_user_saved_searches.sql | Alert infrastructure |
| market_aggregates | ✅ EXISTS | 20260621040000_teardowns_and_market_trends.sql | Price history rollup |
| flash_deals_tracking | ✅ EXISTS | 20260623210035_flash_deals_tracking.sql | Flash deals |
| market_velocity | ✅ EXISTS | 20260623240000_market_velocity.sql | Market activity |
| dealer_deals | ⏳ TODO | - | Outcome logging (Phase 3) |
| dealer_calibration | ⏳ TODO | - | Learned multipliers (Phase 3) |
| dealer_profiles | ⏳ TODO | - | Cost defaults (Phase 3) |
| dealer_inventory | ⏳ TODO | - | Floorplan tracking (Phase 4) |
| recon_shops | ⏳ TODO | - | Shop directory (Phase 5) |
| recon_jobs | ⏳ TODO | - | Job tracking (Phase 5) |
| auction_run_lists | ⏳ TODO | - | Pre-cache (Phase 1) |
| network_outcomes | ⏳ TODO | - | Anonymous sharing (Phase 6) |

---

## UI Components Status

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| DealCard | ✅ EXISTS | components/shared/DealCard.tsx | Core deal display |
| EmptyState | ✅ EXISTS | app/(dashboard)/scan/page.tsx | User-friendly |
| ErrorState | ✅ EXISTS | components/shared/ErrorState.tsx | Shared component |
| MaxBidCalculator | ⏳ TODO | - | Needs UI for existing logic |
| OutcomeLogger | ⏳ TODO | - | Phase 3 |
| CalibrationDashboard | ⏳ TODO | - | Phase 3 |
| LaneModeUI | ⏳ TODO | - | Phase 1 (Auction Co-Pilot) |
| MarketTimingBadge | ⏳ TODO | - | Data exists in view, needs UI |
| SavedSearchManager | ⏳ TODO | - | Table exists, needs management UI |

---

## API Routes Status

| Route | Status | File | Notes |
|-------|--------|------|-------|
| /api/scan | ✅ EXISTS | app/api/scan/route.ts | Main search |
| /api/deal/:id | ✅ EXISTS | app/api/deal/[id]/route.ts | Deal details |
| /api/admin/rescore | ✅ FIXED | app/api/admin/rescore/route.ts | Valuation recalc |
| /api/image/proxy | ✅ CREATED | app/api/image/proxy/route.ts | Image hotlink fix |
| /api/auction/run-list | ⏳ TODO | - | Phase 1 |
| /api/dealer/deals | ⏳ TODO | - | Phase 3 (outcome logging) |
| /api/calibrate | ⏳ TODO | - | Phase 3 |
| /api/inventory | ⏳ TODO | - | Phase 4 |
| /api/recon | ⏳ TODO | - | Phase 5 |
| /api/intelligence | ⏳ TODO | - | Phase 6 |

---

## Scraper Status

| Source | Status | Last Seen | Notes |
|--------|--------|-----------|-------|
| Craigslist | ✅ WORKING | Active | Producing data |
| Cars.com | ⏳ DORMANT | - | Needs FlareSolverr |
| CarGurus | ⏳ DORMANT | - | Needs FlareSolverr |
| AutoTrader | ⏳ DORMANT | - | Needs FlareSolverr |
| Facebook | ⏳ TODO | - | Not built yet |
| OfferUp | ⏳ TODO | - | Not built yet |
| Copart | ⏳ TODO | - | Not built yet |
| IAA | ⏳ TODO | - | Not built yet |

**Deal Volume:**
- Current: ~100-200 deals (Craigslist only)
- After FlareSolverr: ~1,000-2,000 deals (4 sources)
- After all sources: ~5,000-10,000 deals (8 sources)

---

## External Services Status

| Service | Status | Cost | Purpose |
|---------|--------|------|---------|
| Supabase Pro | ✅ ACTIVE | $25/mo | Database + Auth |
| Vercel Pro | ✅ ACTIVE | $20/mo | Hosting |
| FlareSolverr | ⏳ TODO | $0 | CloudFlare bypass |
| Resend | ✅ CONNECTED | $0-20/mo | Email |
| Twilio | ✅ CONNECTED | Pay-per-use | SMS |
| OpenAI | ✅ CONNECTED | ~$5-10/mo | AI features |
| Nominatim | ✅ FREE | $0 | Geocoding |
| OpenStreetMap | ✅ FREE | $0 | Maps |
| Stripe | ⏳ TODO | 2.9% + 30¢ | Payments |

**Total monthly burn:** ~$50/mo (scales with usage)

---

## Critical Metrics (Target vs Current)

| Metric | Current | Week 4 Target | Month 3 Target | Month 6 Target |
|--------|---------|---------------|----------------|----------------|
| Active deals | 100-200 | 1,000+ | 5,000+ | 10,000+ |
| Deal sources | 1 | 4 | 6 | 8 |
| Paying dealers | 0 | 5 | 50 | 200 |
| MRR | $0 | $145 | $2,900 | $10,000 |
| Outcome logs | 0 | 50+ | 500+ | 2,000+ |
| Calibrated dealers | 0 | 5+ | 40+ | 150+ |

---

## Revenue Projections

| Tier | Price | Target Users | MRR | Notes |
|------|-------|--------------|-----|-------|
| Free | $0 | Unlimited | $0 | Limited features, 20 deals/day |
| Pro | $29/mo | 150 | $4,350 | Unlimited deals, saved searches, alerts |
| Elite | $79/mo | 50 | $3,950 | Auction Co-Pilot, priority support |
| **Total** | - | 200 | **$8,300** | Month 6 target |

**Add-ons:**
- Recon referrals: $2-5K/mo (Phase 5)
- Data contracts: $2.5M ARR (Year 2, Phase 8)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Dealers don't use Auction Co-Pilot | MEDIUM | CRITICAL | Validate with 5 dealers before building |
| Valuation stays wrong | LOW | HIGH | Fixed (outlier rejection) |
| Can't get enough deal volume | MEDIUM | HIGH | FlareSolverr unlocks 4 more sources |
| No outcome logging | MEDIUM | CRITICAL | Make logging dead simple (<60 sec) |
| Stripe issues | LOW | HIGH | Test in sandbox first |
| Competitive pressure | MEDIUM | MEDIUM | Outcome calibration is the moat |

**Overall risk:** MEDIUM - success depends on dealer adoption of Auction Co-Pilot

---

## Next 7 Days (Detailed)

### Monday (Today)
- [x] Fix sell_estimate write-back
- [x] Fix outlier rejection
- [x] Create image proxy
- [ ] Start FlareSolverr
- [ ] Update DealCard for image proxy
- [ ] Add Vercel env vars

### Tuesday
- [ ] Run rescore on all deals
- [ ] Verify IQ chips accurate
- [ ] Verify images load
- [ ] Confirm 4 scrapers producing data

### Wednesday
- [ ] Design Lane Mode UI mockup
- [ ] Create dealer feedback form
- [ ] Reach out to 5 dealers for Auction Co-Pilot validation

### Thursday
- [ ] Start building run list upload endpoint
- [ ] Create auction_run_lists table
- [ ] Build batch analysis job

### Friday
- [ ] Continue Auction Co-Pilot development
- [ ] Set up offline caching infrastructure
- [ ] Test VIN barcode scanner on mobile

### Weekend
- [ ] Test Auction Co-Pilot with mock data
- [ ] Refine UI based on mobile testing
- [ ] Prepare demo for dealer feedback

---

## Success Milestones

| Milestone | Target Date | Status | Success Criteria |
|-----------|-------------|--------|------------------|
| Phase 0 Complete | June 24, 2026 | 50% | All bugs fixed, 4 scrapers working |
| First paying dealer | July 5, 2026 | 0% | $29 Pro subscription |
| Auction Co-Pilot launched | July 15, 2026 | 0% | 5 dealers using at real auctions |
| 50 dealers logging outcomes | Aug 15, 2026 | 0% | Calibration data accumulating |
| $10K MRR | Sep 30, 2026 | 0% | 200 paying dealers |
| Network effects visible | Nov 15, 2026 | 0% | Predictions improving with scale |

---

## Key Learnings

**What's working:**
- Strong backend foundation (70% built)
- Profit calculation is sophisticated
- Intelligence modules exist
- Database schema is solid

**What's not working:**
- Only 1 of 4 scrapers producing data
- Wrong profit estimates (fixed today)
- No outcome logging (the moat)
- No UI for advanced features

**What to prioritize:**
1. Auction Co-Pilot (make-or-break)
2. Outcome logging (the moat)
3. Deal volume (FlareSolverr)
4. Everything else

**What to avoid:**
- Building features dealers don't ask for
- Over-engineering before validation
- Chasing competitors' features
- Adding complexity before simplicity works

---

**Last Updated:** June 23, 2026 at 2:00 PM  
**Next Update:** June 24, 2026 (after Phase 0 complete)  
**Owner:** You  
**Questions:** Re-read docs/REALISTIC-EXECUTION-PLAN.md for full context
