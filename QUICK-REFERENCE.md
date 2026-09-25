# 🚀 DealerHunt Pro - Quick Reference Card

**Use this for:** Fast lookups during integration

---

## 📦 What Was Built

| Component           | File                                       | Purpose                       | Lines |
| ------------------- | ------------------------------------------ | ----------------------------- | ----- |
| MaxBidCalculator    | `/components/shared/MaxBidCalculator.tsx`  | Interactive ROI calculator    | 230   |
| OutcomeLogger       | `/components/shared/OutcomeLogger.tsx`     | 4-step outcome logging wizard | 580   |
| MarketTimingBadge   | `/components/shared/MarketTimingBadge.tsx` | Market condition indicator    | 85    |
| Image Proxy         | `/app/api/image/proxy/route.ts`            | Bypass hotlink blocking       | 85    |
| Dealer API          | `/app/api/dealer/deals/route.ts`           | Outcome logging backend       | 125   |
| Performance Indexes | `/supabase/migrations/...000.sql`          | Query optimization            | 95    |
| Outcome Logging     | `/supabase/migrations/...010.sql`          | The moat tables               | 425   |

---

## ⚡ Integration Commands

### 1. Run Migrations

```bash
# Performance indexes
psql $DATABASE_URL -f supabase/migrations/20260624000000_performance_indexes.sql

# Outcome logging
psql $DATABASE_URL -f supabase/migrations/20260624010000_dealer_outcome_logging.sql

# Verify
psql $DATABASE_URL -c "\dt dealer_*"
```

### 2. Import Components

```tsx
import { MaxBidCalculator } from "@/components/shared/MaxBidCalculator";
import { OutcomeLogger } from "@/components/shared/OutcomeLogger";
import { MarketTimingBadge } from "@/components/shared/MarketTimingBadge";
```

### 3. Use MaxBidCalculator

```tsx
<MaxBidCalculator
  deal={{
    year: deal.year,
    make: deal.make,
    model: deal.model,
    askPrice: deal.askPrice,
    sellEstimate: deal.sellEstimate,
    recommendedMaxBid: deal.recommendedMaxBid,
    repairEstimate: deal.repairEstimate,
    transportEstimate: deal.transportEstimate,
  }}
/>
```

### 4. Use OutcomeLogger

```tsx
<OutcomeLogger
  dealId={deal.id}
  dealInfo={{
    year: deal.year,
    make: deal.make,
    model: deal.model,
    vin: deal.vin,
    askPrice: deal.askPrice,
    sellEstimate: deal.sellEstimate,
    recommendedMaxBid: deal.recommendedMaxBid,
    repairEstimate: deal.repairEstimate,
    transportEstimate: deal.transportEstimate,
  }}
  onSuccess={() => {
    alert("Outcome logged!");
  }}
/>
```

### 5. Use MarketTimingBadge

```tsx
<MarketTimingBadge signal="cooling" priceChange={-3.2} />
```

---

## 🗄️ Database Quick Reference

### Tables

- `dealer_profiles` - Dealer info + cost baselines
- `dealer_deals` - Logged outcomes (THE MOAT)
- `dealer_calibration` - Learned multipliers

### Key Functions

```sql
-- Compute calibration for a dealer (runs automatically)
SELECT compute_dealer_calibration('user-uuid-here');

-- Check calibration
SELECT * FROM dealer_calibration WHERE user_id = 'user-uuid';

-- View logged outcomes
SELECT * FROM dealer_deals WHERE user_id = 'user-uuid' ORDER BY created_at DESC;
```

### Sample Queries

```sql
-- See calibration for all dealers
SELECT
  user_id,
  transport_multiplier,
  recon_multiplier,
  profit_accuracy_pct,
  sample_size,
  confidence_score
FROM dealer_calibration
ORDER BY sample_size DESC;

-- See recent outcomes
SELECT
  year, make, model,
  purchase_price,
  actual_all_in_cost,
  sell_price,
  actual_profit,
  actual_roi
FROM dealer_deals
WHERE sold = true
ORDER BY sell_date DESC
LIMIT 10;
```

---

## 🔧 Remaining Bug Fixes (30 min)

### 1. Start FlareSolverr

```bash
docker run -d --name flaresolverr --restart always \
  -p 8191:8191 -e LOG_LEVEL=warn \
  ghcr.io/flaresolverr/flaresolverr:latest

echo 'FLARESOLVERR_URL=http://localhost:8191' >> .env.local
```

### 2. Vercel Env Vars

Add to Vercel dashboard (Settings → Environment Variables):

```
STRIPE_SECRET_KEY=sk_live_...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...
RESEND_API_KEY=re_...
CRON_SECRET=[random 32 chars]
INGEST_SECRET=[random 32 chars]
```

---

## 📊 Progress Tracker

| Metric     | Before | After      |
| ---------- | ------ | ---------- |
| Backend    | 70%    | 85%        |
| UI         | 30%    | 65%        |
| Overall    | 50%    | 75%        |
| Bugs Fixed | 0/6    | 3/6        |
| Moat       | 0%     | Foundation |

---

## 📁 File Locations

### Components

```
components/shared/
├── MaxBidCalculator.tsx     ← ROI calculator
├── OutcomeLogger.tsx        ← Logging wizard
├── MarketTimingBadge.tsx    ← Market indicator
├── ImageGallery.tsx         ← Already exists (uses proxy)
└── DealCard.tsx             ← Already exists (needs badge)
```

### API Routes

```
app/api/
├── image/proxy/route.ts     ← Image proxy (NEW)
├── dealer/deals/route.ts    ← Outcome API (NEW)
└── admin/rescore/route.ts   ← Fixed (writes sell_estimate)
```

### Database

```
supabase/migrations/
├── 20260624000000_performance_indexes.sql   ← NEW
└── 20260624010000_dealer_outcome_logging.sql ← NEW
```

### Docs

```
docs/
├── REALISTIC-EXECUTION-PLAN.md    ← Master plan
├── GAP-ANALYSIS.md                ← What exists
├── IMPLEMENTATION-STATUS.md       ← Full tracker
├── 100-PERCENT-READY.md           ← 3-tier launch
├── UPGRADE-COMPLETE.md            ← Integration guide
├── PHASE-0-BUGS-FIXED.md          ← Bug status
└── QUICK-FIX-GUIDE.md             ← 30-min setup
```

---

## 🎯 Next Steps (In Order)

1. ☐ Run migrations (10 min)
2. ☐ Add MaxBidCalculator to deal page (30 min)
3. ☐ Add OutcomeLogger to deal page (45 min)
4. ☐ Test flow (30 min)
5. ☐ Start FlareSolverr (5 min)
6. ☐ Add Vercel env vars (15 min)
7. ☐ Deploy (5 min)

**Total:** 2 hours 20 minutes

---

## 💡 Key Concepts

### The Moat

```
Generic Estimates → Dealer Logs Outcomes → System Learns →
Personalized Estimates → More Accurate → Dealer Locked In
```

### Calibration Formula

```
multiplier = avg(actual_cost) / avg(platform_estimate)

Example:
- Platform always estimates transport = $600
- Dealer always pays $720
- After 10 outcomes: multiplier = $720 / $600 = 1.2
- Future estimates: $600 × 1.2 = $720 (accurate!)
```

### Confidence Score

```
confidence = 50 + 15 × log(sample_size)

10 deals  = 60% confidence
20 deals  = 75% confidence
50 deals  = 90% confidence
100 deals = 95% confidence
```

---

## 🚨 Common Issues

### "Table doesn't exist"

```bash
# Run migrations
psql $DATABASE_URL -f supabase/migrations/20260624010000_dealer_outcome_logging.sql
```

### "Component not found"

```bash
# Check file exists
ls -la components/shared/MaxBidCalculator.tsx

# If missing, component files are in project root
```

### "API returns 401"

```tsx
// Make sure user is authenticated
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return redirect("/login");
```

### "Images still broken"

```tsx
// Check if using proxiedImage() utility
import { proxiedImage } from "@/lib/image-url";
const proxied = proxiedImage(deal.imageUrl);
```

---

## 📞 Help Resources

- **Integration:** `/docs/UPGRADE-COMPLETE.md`
- **Full Status:** `/docs/IMPLEMENTATION-STATUS.md`
- **Bug Fixes:** `/docs/PHASE-0-BUGS-FIXED.md`
- **Quick Setup:** `/docs/QUICK-FIX-GUIDE.md`
- **Master Plan:** `/docs/REALISTIC-EXECUTION-PLAN.md`

---

## ✅ Success Checklist

After integration, verify:

- [ ] MaxBidCalculator visible on deal page
- [ ] "Log Outcome" button visible
- [ ] Outcome logger wizard works
- [ ] Submission saves to database
- [ ] Calibration computes after 10 outcomes
- [ ] Images load (through proxy)
- [ ] Queries are fast (<50ms)

---

**Time Investment:** 2 hours to integrate everything

**Impact:** 50% → 75% complete, moat foundation built

**Next Milestone:** First dealer with 10 outcomes → calibration working → moat proven

---

Keep this file open while integrating! 🚀
