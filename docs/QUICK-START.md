# Quick Start Guide - Start Building Today

## What You're Building

A profit intelligence platform that learns each dealer's cost structure and gets smarter over time. Think Kayak + Priceline for car dealers.

---

## Step 1: Run Database Setup (30 minutes)

### Create the tables

```bash
# Connect to your Supabase database
psql $DATABASE_URL
```

Then run this SQL:

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Price alerts
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_min INT,
  year_max INT,
  target_price NUMERIC(10,2) NOT NULL,
  radius_miles INT DEFAULT 500,
  active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_alerts_active ON price_alerts(active, make, model) WHERE active = TRUE;

-- Saved searches
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My search',
  makes TEXT[],
  models TEXT[],
  year_min INT,
  year_max INT,
  price_max NUMERIC(10,2),
  min_profit NUMERIC(10,2) DEFAULT 0,
  radius_miles INT DEFAULT 500,
  verdicts TEXT[] DEFAULT ARRAY['GO'],
  notify BOOLEAN DEFAULT TRUE,
  last_matched_at TIMESTAMPTZ,
  match_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_active ON saved_searches(user_id, notify) WHERE notify = TRUE;

-- Dealer deals (saved + outcome logging)
CREATE TABLE dealer_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT,
  purchased BOOLEAN DEFAULT FALSE,
  purchase_price NUMERIC(10,2),
  purchased_at TIMESTAMPTZ,
  sold BOOLEAN DEFAULT FALSE,
  sell_price NUMERIC(10,2),
  sold_at TIMESTAMPTZ,
  days_to_sell INT,
  sold_where TEXT,
  actual_transport NUMERIC(10,2),
  actual_recon NUMERIC(10,2),
  actual_fees NUMERIC(10,2),
  platform_est_profit NUMERIC(10,2),
  actual_profit NUMERIC(10,2),
  CONSTRAINT dealer_deals_unique UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_dealer_deals_user ON dealer_deals(user_id, saved_at DESC);

-- Price snapshots (for history graph)
CREATE TABLE vehicle_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT NOT NULL,
  state TEXT,
  avg_price NUMERIC(10,2) NOT NULL,
  median_price NUMERIC(10,2),
  sample_count INT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_snapshot UNIQUE (make, model, year, state, snapshot_date)
);

CREATE INDEX idx_snapshots_lookup ON vehicle_price_snapshots(make, model, year, snapshot_date DESC);

-- Dealer calibration
CREATE TABLE dealer_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transport_multiplier NUMERIC(5,3) DEFAULT 1.0,
  recon_multiplier NUMERIC(5,3) DEFAULT 1.0,
  profit_accuracy_pct NUMERIC(5,2),
  sample_size INT DEFAULT 0,
  confidence_score NUMERIC(5,2) DEFAULT 0.0,
  last_outcome_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT dealer_calibration_user UNIQUE (user_id)
);

-- Add columns to deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS flash_eligible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lat FLOAT8,
  ADD COLUMN IF NOT EXISTS lng FLOAT8,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distress_signals TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_deals_flash ON deals(created_at DESC)
  WHERE deal_verdict = 'GO' AND flash_eligible = TRUE;

CREATE INDEX IF NOT EXISTS idx_deals_geo ON deals USING GIST(ST_MakePoint(lng, lat))
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
```

### START THE PRICE SNAPSHOT JOB (CRITICAL)

This runs daily at 2am and builds price history data. **Start it NOW** even though you won't use the data for 30 days.

```sql
SELECT cron.schedule(
  'daily-price-snapshots',
  '0 2 * * *',
  $$
  INSERT INTO vehicle_price_snapshots (make, model, year, state, avg_price, median_price, sample_count)
  SELECT
    make, model, year, state,
    AVG(price) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price,
    COUNT(*) as sample_count
  FROM deals
  WHERE created_at > CURRENT_DATE - INTERVAL '1 day'
    AND price IS NOT NULL AND price > 0
  GROUP BY make, model, year, state
  HAVING COUNT(*) >= 3
  ON CONFLICT (make, model, year, state, snapshot_date) DO UPDATE SET
    avg_price = EXCLUDED.avg_price,
    median_price = EXCLUDED.median_price,
    sample_count = EXCLUDED.sample_count;
  $$
);
```

Verify it's scheduled:

```sql
SELECT * FROM cron.job;
```

---

## Step 2: Build Max Bid Engine (4 hours)

This is the easiest feature and delivers immediate value.

### Create API route

File: `app/api/deal/calculate-max-bid/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { deal_id, target_profit } = await req.json();

  const { data: deal } = await supabase
    .from("deals")
    .select("*")
    .eq("id", deal_id)
    .single();

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get dealer's historical costs
  const { data: outcomes } = await supabase
    .from("dealer_deals")
    .select("actual_transport, actual_recon, actual_fees")
    .eq("user_id", user.id)
    .not("actual_transport", "is", null)
    .limit(20);

  const avgTransport =
    outcomes?.length > 0
      ? outcomes.reduce((sum, o) => sum + (o.actual_transport || 0), 0) /
        outcomes.length
      : deal.estimated_transport_cost || 450;

  const avgRecon =
    outcomes?.length > 0
      ? outcomes.reduce((sum, o) => sum + (o.actual_recon || 0), 0) /
        outcomes.length
      : deal.estimated_repair_cost || 580;

  const fees = 150;
  const maxBid =
    (deal.sell_estimate || deal.price * 1.3) -
    target_profit -
    avgTransport -
    avgRecon -
    fees;

  return NextResponse.json({
    max_bid: Math.max(0, Math.round(maxBid)),
    target_profit,
    estimated_costs: {
      transport: Math.round(avgTransport),
      recon: Math.round(avgRecon),
      fees,
    },
    message: `Do not bid above $${Math.round(maxBid).toLocaleString()}`,
  });
}
```

### Create UI component

File: `components/MaxBidCalculator.tsx`

```typescript
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function MaxBidCalculator({ dealId }: { dealId: string }) {
  const [targetProfit, setTargetProfit] = useState(2000);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    const res = await fetch('/api/deal/calculate-max-bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, target_profit: targetProfit }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="font-semibold">Max Bid Calculator</h3>
      <Input
        type="number"
        value={targetProfit}
        onChange={(e) => setTargetProfit(Number(e.target.value))}
        placeholder="Target profit (e.g., 2000)"
      />
      <Button onClick={calculate} disabled={loading} className="w-full">
        Calculate Max Bid
      </Button>
      {result && (
        <div className="bg-primary/10 p-4 rounded">
          <div className="text-3xl font-bold text-primary">
            ${result.max_bid.toLocaleString()}
          </div>
          <p className="text-sm mt-2">{result.message}</p>
        </div>
      )}
    </div>
  );
}
```

### Add to deal page

In `app/(dashboard)/deal/[id]/page.tsx`, import and add:

```typescript
import { MaxBidCalculator } from '@/components/MaxBidCalculator';

// ... in your component
<MaxBidCalculator dealId={deal.id} />
```

### Test it

1. Navigate to any deal page
2. Enter a target profit
3. Click "Calculate Max Bid"
4. Should show a number instantly

**DONE! First feature complete.**

---

## Step 3: Build Flash Deal Feed (4 hours)

### Mark flash-eligible deals

Create worker: `workers/flashDealScan.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function markFlashDeals() {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // Find deals: <24h old, GO verdict, 10%+ below market
  const { data: deals } = await supabase
    .from("deals")
    .select("id, price, sell_estimate")
    .gte("created_at", twentyFourHoursAgo)
    .eq("deal_verdict", "GO")
    .not("sell_estimate", "is", null);

  if (!deals) return;

  const flashDeals = deals.filter(
    (d) => d.price <= d.sell_estimate * 0.9, // 10% below market
  );

  // Mark them
  await supabase
    .from("deals")
    .update({ flash_eligible: true })
    .in(
      "id",
      flashDeals.map((d) => d.id),
    );

  console.log(`Marked ${flashDeals.length} flash deals`);
}
```

### Create page

File: `app/(dashboard)/flash/page.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function FlashDealsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function fetchFlash() {
      const { data } = await supabase
        .from('deals')
        .select('*')
        .eq('flash_eligible', true)
        .eq('deal_verdict', 'GO')
        .order('created_at', { ascending: false })
        .limit(50);

      setDeals(data || []);
    }
    fetchFlash();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">⚡ Flash Deals</h1>
      <p className="text-muted-foreground mb-6">
        Time-sensitive deals 10%+ below market
      </p>
      <div className="grid gap-4">
        {deals.map(deal => (
          <div key={deal.id} className="border rounded-lg p-4">
            <h3 className="font-semibold">
              {deal.year} {deal.make} {deal.model}
            </h3>
            <p className="text-2xl font-bold text-green-600">
              ${deal.price.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Est. profit: ${deal.true_net_profit?.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Schedule the worker

Add to `workers/index.ts`:

```typescript
import { Queue, Worker } from "bullmq";
import { markFlashDeals } from "./flashDealScan";

const queue = new Queue("intelligence", {
  connection: { host: "localhost", port: 6379 },
});
const worker = new Worker(
  "intelligence",
  async (job) => {
    if (job.name === "flash-deal-scan") {
      await markFlashDeals();
    }
  },
  { connection: { host: "localhost", port: 6379 } },
);

// Run every hour
queue.add("flash-deal-scan", {}, { repeat: { pattern: "0 * * * *" } });
```

**DONE! Flash deals showing.**

---

## Step 4: What's Next?

You now have:
✅ Max Bid Engine working  
✅ Flash Deal Feed showing  
✅ Database structure ready  
✅ Price snapshots accumulating (silently)

### Next priorities:

1. **Price Sniper** (6 hours) - See blueprint section for full code
2. **Saved Search Alerts** (8 hours) - See blueprint section
3. **Outcome Logging** (16 hours) - This is the lock, high priority

### Timeline:

- **Week 1:** Max Bid + Flash + Price Sniper + Saved Searches
- **Week 2-3:** Outcome Logging + Calibration
- **Week 4-8:** Map + Price History (after data accumulates)

---

## Key Resources

- **Full Blueprint:** `docs/INTELLIGENCE-EXPANSION-BLUEPRINT.md`
- **Implementation Checklist:** `docs/IMPLEMENTATION-CHECKLIST.md`
- **This Guide:** `docs/QUICK-START.md`

---

## Common First-Time Issues

**Issue:** "deals table doesn't exist"  
**Fix:** You're in the wrong database. Check your .env.local

**Issue:** "PostGIS extension not available"  
**Fix:** Contact Supabase support or check project settings

**Issue:** "Redis connection failed"  
**Fix:** Make sure Redis is running: `redis-server`

**Issue:** "Can't import createClient"  
**Fix:** Check your Supabase utility path: `@/lib/supabase/server` or `@/lib/supabase/client`

---

## Need Help?

1. Read the full blueprint for detailed explanations
2. Check the implementation checklist for step-by-step tasks
3. Each feature is independent - if stuck on one, move to another

---

## Success Criteria for Today

By end of today, you should have:

- [x] Database tables created
- [x] Price snapshot job running
- [x] Max Bid Engine working on at least one deal page
- [x] Flash Deal page showing deals

**That's momentum. Keep going tomorrow.**

Good luck! 🚀
