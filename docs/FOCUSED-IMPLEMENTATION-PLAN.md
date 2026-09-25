# Focused Implementation Plan - Based on Real Gaps

**Date:** June 23, 2026  
**Reality:** Build what's missing, use what exists, ship in 6 weeks

---

## Current State Summary

✅ **Have:**
- Profit calculator with max bid logic
- Market timing view
- Saved searches table
- Flash deals tracking
- Deal similarity (pgvector)
- BullMQ workers setup
- Email/SMS integration

❌ **Need:**
- Outcome logging (critical)
- Dealer calibration (critical)
- All UI components (critical)
- Geocoding worker
- Notification templates

---

## Week 1: Outcome Logging (The Moat)

### Day 1: Database Foundation

**Create Missing Tables:**

```sql
-- 1. Dealer profiles (cost assumptions per dealer)
CREATE TABLE dealer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  home_state TEXT DEFAULT 'TX',
  home_city TEXT,
  baseline_transport_multiplier NUMERIC(5,3) DEFAULT 1.0,
  baseline_recon_multiplier NUMERIC(5,3) DEFAULT 1.0,
  target_roi NUMERIC(5,3) DEFAULT 0.20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Dealer deals (saves + outcomes)
CREATE TABLE dealer_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  
  -- Save metadata
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT,
  source_search_id UUID REFERENCES user_saved_searches(id),
  
  -- Purchase tracking
  purchased BOOLEAN DEFAULT FALSE,
  purchase_price NUMERIC(10,2),
  purchased_at TIMESTAMPTZ,
  
  -- Sale tracking
  sold BOOLEAN DEFAULT FALSE,
  sell_price NUMERIC(10,2),
  sold_at TIMESTAMPTZ,
  days_to_sell INT GENERATED ALWAYS AS (
    CASE WHEN sold_at IS NOT NULL AND purchased_at IS NOT NULL 
    THEN EXTRACT(DAY FROM sold_at - purchased_at)::INT
    ELSE NULL END
  ) STORED,
  
  -- Actual costs
  actual_transport NUMERIC(10,2),
  actual_recon NUMERIC(10,2),
  actual_fees NUMERIC(10,2),
  
  -- Platform estimates (copy from deals table at save time)
  platform_est_transport NUMERIC(10,2),
  platform_est_recon NUMERIC(10,2),
  platform_est_profit NUMERIC(10,2),
  
  -- Calculated actual profit
  actual_profit NUMERIC(10,2),
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT dealer_deals_unique UNIQUE (user_id, deal_id)
);

CREATE INDEX idx_dealer_deals_user ON dealer_deals(user_id, saved_at DESC);
CREATE INDEX idx_dealer_deals_purchased ON dealer_deals(user_id, purchased) WHERE purchased = TRUE;
CREATE INDEX idx_dealer_deals_sold ON dealer_deals(user_id, sold) WHERE sold = TRUE;

-- 3. Dealer calibration (learned multipliers)
CREATE TABLE dealer_calibration (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  transport_multiplier NUMERIC(5,3) DEFAULT 1.0,
  recon_multiplier NUMERIC(5,3) DEFAULT 1.0,
  
  profit_accuracy_pct NUMERIC(5,2),
  sample_size INT DEFAULT 0,
  confidence_score NUMERIC(5,2) DEFAULT 0,
  
  last_outcome_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE dealer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile" ON dealer_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_deals" ON dealer_deals FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_calibration" ON dealer_calibration FOR ALL USING (user_id = auth.uid());
```

### Day 2: API Routes

**Create:** `app/api/dealer/deals/route.ts`

```typescript
// POST /api/dealer/deals - Save a deal
// GET /api/dealer/deals - List saved deals
// PATCH /api/dealer/deals/:id - Update outcome

import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { deal_id, note } = await req.json();

  // Get deal details to copy estimates
  const { data: deal } = await supabase
    .from('deals')
    .select('estimated_transport_cost, estimated_repair_cost, true_net_profit')
    .eq('id', deal_id)
    .single();

  const { data, error } = await supabase
    .from('dealer_deals')
    .insert({
      user_id: user.id,
      deal_id,
      note,
      platform_est_transport: deal?.estimated_transport_cost,
      platform_est_recon: deal?.estimated_repair_cost,
      platform_est_profit: deal?.true_net_profit,
    })
    .select()
    .single();

  return Response.json(data);
}
```

**Create:** `app/api/dealer/outcomes/route.ts`

```typescript
// PATCH /api/dealer/outcomes/:id - Log purchase or sale

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...updates } = await req.json();

  // Calculate actual profit if all data present
  if (updates.sold && updates.sell_price && updates.purchase_price) {
    updates.actual_profit = 
      updates.sell_price - 
      updates.purchase_price - 
      (updates.actual_transport || 0) - 
      (updates.actual_recon || 0) - 
      (updates.actual_fees || 0);
  }

  const { data, error } = await supabase
    .from('dealer_deals')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  // Trigger calibration update if this was a complete outcome
  if (updates.sold && data) {
    await fetch('/api/dealer/calibration/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    });
  }

  return Response.json(data);
}
```

### Day 3-4: UI Components

**Create:** `components/SaveDealButton.tsx`

```typescript
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bookmark } from 'lucide-react';

export function SaveDealButton({ dealId }: { dealId: string }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const res = await fetch('/api/dealer/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId }),
    });
    if (res.ok) setSaved(true);
    setLoading(false);
  }

  return (
    <Button 
      onClick={handleSave} 
      disabled={loading || saved}
      variant={saved ? 'secondary' : 'default'}
    >
      <Bookmark className={saved ? 'fill-current' : ''} />
      {saved ? 'Saved' : 'Save Deal'}
    </Button>
  );
}
```

**Create:** `components/OutcomeLogger.tsx`

```typescript
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OutcomeLoggerProps {
  dealId: string;
  saved: boolean;
  onComplete?: () => void;
}

export function OutcomeLogger({ dealId, saved, onComplete }: OutcomeLoggerProps) {
  const [step, setStep] = useState<'purchase' | 'sale'>('purchase');
  const [data, setData] = useState({
    purchased: false,
    purchase_price: '',
    sold: false,
    sell_price: '',
    actual_transport: '',
    actual_recon: '',
    actual_fees: '',
  });

  async function logPurchase() {
    await fetch(`/api/dealer/outcomes/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dealId,
        purchased: true,
        purchased_at: new Date().toISOString(),
        purchase_price: parseFloat(data.purchase_price),
      }),
    });
    setStep('sale');
  }

  async function logSale() {
    await fetch(`/api/dealer/outcomes/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dealId,
        sold: true,
        sold_at: new Date().toISOString(),
        sell_price: parseFloat(data.sell_price),
        actual_transport: parseFloat(data.actual_transport) || 0,
        actual_recon: parseFloat(data.actual_recon) || 0,
        actual_fees: parseFloat(data.actual_fees) || 0,
      }),
    });
    onComplete?.();
  }

  if (step === 'purchase') {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Did you buy this car?</h3>
        <div>
          <Label>Purchase Price</Label>
          <Input 
            type="number" 
            value={data.purchase_price}
            onChange={(e) => setData({...data, purchase_price: e.target.value})}
            placeholder="9200"
          />
        </div>
        <Button onClick={logPurchase} disabled={!data.purchase_price}>
          Yes, I Bought It
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Have you sold it?</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Sell Price</Label>
          <Input 
            type="number" 
            value={data.sell_price}
            onChange={(e) => setData({...data, sell_price: e.target.value})}
          />
        </div>
        <div>
          <Label>Transport Cost</Label>
          <Input 
            type="number" 
            value={data.actual_transport}
            onChange={(e) => setData({...data, actual_transport: e.target.value})}
          />
        </div>
        <div>
          <Label>Recon Cost</Label>
          <Input 
            type="number" 
            value={data.actual_recon}
            onChange={(e) => setData({...data, actual_recon: e.target.value})}
          />
        </div>
        <div>
          <Label>Fees</Label>
          <Input 
            type="number" 
            value={data.actual_fees}
            onChange={(e) => setData({...data, actual_fees: e.target.value})}
          />
        </div>
      </div>
      <Button onClick={logSale} disabled={!data.sell_price}>
        Log Complete Deal
      </Button>
    </div>
  );
}
```

### Day 5: Integration

- Add `SaveDealButton` to deal cards
- Add outcome logging to saved deals page
- Set up notification reminders (24h, 7d after save)
- Test full flow

**Week 1 Done:** Dealers can save deals and log outcomes

---

## Week 2: Calibration System

### Day 1-2: Calibration Logic

**Create:** `lib/intelligence/dealerCalibration.ts`

```typescript
import { createClient } from '@/lib/supabase/server';

export async function calculateCalibration(userId: string) {
  const supabase = await createClient();

  // Get last 30 sold deals
  const { data: outcomes } = await supabase
    .from('dealer_deals')
    .select('*')
    .eq('user_id', userId)
    .eq('sold', true)
    .not('actual_profit', 'is', null)
    .order('sold_at', { ascending: false })
    .limit(30);

  if (!outcomes || outcomes.length < 5) {
    return null; // Not enough data
  }

  // Calculate multipliers
  const transportMultiplier = outcomes
    .filter(o => o.actual_transport && o.platform_est_transport)
    .reduce((sum, o) => sum + (o.actual_transport / o.platform_est_transport), 0) 
    / outcomes.filter(o => o.actual_transport).length;

  const reconMultiplier = outcomes
    .filter(o => o.actual_recon && o.platform_est_recon)
    .reduce((sum, o) => sum + (o.actual_recon / o.platform_est_recon), 0)
    / outcomes.filter(o => o.actual_recon).length;

  // Calculate accuracy
  const profitAccuracy = outcomes
    .filter(o => o.actual_profit && o.platform_est_profit)
    .reduce((sum, o) => {
      const error = Math.abs(o.actual_profit - o.platform_est_profit) / o.platform_est_profit;
      return sum + error;
    }, 0) / outcomes.filter(o => o.actual_profit).length;

  const confidence = Math.min((outcomes.length / 30) * 100, 100);

  return {
    transportMultiplier: transportMultiplier || 1.0,
    reconMultiplier: reconMultiplier || 1.0,
    profitAccuracy: (1 - profitAccuracy) * 100,
    sampleSize: outcomes.length,
    confidence,
  };
}

export async function updateDealerCalibration(userId: string) {
  const calibration = await calculateCalibration(userId);
  if (!calibration) return;

  const supabase = await createClient();
  await supabase
    .from('dealer_calibration')
    .upsert({
      user_id: userId,
      transport_multiplier: calibration.transportMultiplier,
      recon_multiplier: calibration.reconMultiplier,
      profit_accuracy_pct: calibration.profitAccuracy,
      sample_size: calibration.sampleSize,
      confidence_score: calibration.confidence,
      last_outcome_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
}
```

### Day 3: Integrate with Profit Calculator

**Modify:** `lib/scoring/deal-analyzer.ts`

```typescript
// Add at top
import { getCalibration } from '@/lib/intelligence/dealerCalibration';

// Modify analyzeDeal to accept userId
export async function analyzeDeal(deal: Partial<Deal>, userId?: string): Promise<DealAnalysis> {
  // ... existing code ...

  // Get dealer calibration if userId provided
  let calibration = null;
  if (userId) {
    const { data } = await supabase
      .from('dealer_calibration')
      .select('*')
      .eq('user_id', userId)
      .single();
    calibration = data;
  }

  // Apply calibration to costs
  const transportCost = miles != null 
    ? transportCostForMiles(miles) * (calibration?.transport_multiplier || 1.0)
    : DEFAULT_TRANSPORT_COST;

  const reconCost = fm.reconCost * (calibration?.recon_multiplier || 1.0);

  // ... rest of calculation ...
}
```

### Day 4-5: Calibration Dashboard UI

**Create:** `app/(dashboard)/intelligence/page.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function IntelligencePage() {
  const [calibration, setCalibration] = useState<any>(null);
  const [outcomes, setOutcomes] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: cal } = await supabase
        .from('dealer_calibration')
        .select('*')
        .single();
      
      const { data: outs } = await supabase
        .from('dealer_deals')
        .select('*')
        .eq('sold', true)
        .order('sold_at', { ascending: false })
        .limit(10);

      setCalibration(cal);
      setOutcomes(outs || []);
    }
    load();
  }, []);

  if (!calibration) {
    return <div>Log more deals to unlock intelligence...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Your Dealer Intelligence</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Transport Accuracy</div>
          <div className="text-2xl font-bold">
            {((calibration.transport_multiplier - 1) * 100).toFixed(1)}%
          </div>
          <div className="text-xs">
            {calibration.transport_multiplier > 1 ? 'Above' : 'Below'} baseline
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Recon Accuracy</div>
          <div className="text-2xl font-bold">
            {((calibration.recon_multiplier - 1) * 100).toFixed(1)}%
          </div>
          <div className="text-xs">
            {calibration.recon_multiplier > 1 ? 'Above' : 'Below'} baseline
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Profit Accuracy</div>
          <div className="text-2xl font-bold">
            {calibration.profit_accuracy_pct.toFixed(1)}%
          </div>
          <div className="text-xs">
            Based on {calibration.sample_size} deals
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-4">Recent Outcomes</h2>
        {outcomes.map(o => (
          <div key={o.id} className="border-b py-2 flex justify-between">
            <span>Deal from {new Date(o.saved_at).toLocaleDateString()}</span>
            <span>
              Est: ${o.platform_est_profit?.toLocaleString()} → 
              Actual: ${o.actual_profit?.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Week 2 Done:** Calibration system working, estimates personalized

---

## Week 3: Expose Existing Features (UI Layer)

### Day 1: Max Bid Calculator

Already exists in `deal-analyzer.ts` as `recommendedMaxBid`.

**Create:** `components/MaxBidCalculator.tsx`
- Use existing API calculation
- Simple UI: target profit input → shows max bid
- Add to deal page

### Day 2: Market Timing Badge

Data exists in `market_timing_signals` view.

**Create:** `components/MarketTimingBadge.tsx`
- Query view for make/model
- Show "⏸️ WAIT" or "⚡ BUY NOW" or "📊 STABLE"
- Add to deal cards

### Day 3: Flash Deals Page

Table `flash_deals_tracking` exists.

**Create:** `app/(dashboard)/flash/page.tsx`
- Query flash deals
- Show with countdown timers
- Link to deal pages

### Day 4: Saved Search Manager

Table `user_saved_searches` exists.

**Create:** `components/SavedSearchManager.tsx`
- List, create, edit, delete searches
- Show match count
- Toggle notifications

### Day 5: Polish

- Notification templates
- Error handling
- Loading states
- Mobile responsive

**Week 3 Done:** All existing backend features have UI

---

## Week 4: Geocoding + Map

### Geocoding Worker

**Create:** `workers/geocoding.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import pLimit from 'p-limit';

const limit = pLimit(1); // 1 req/sec for Nominatim

async function geocode(city: string, state: string) {
  return limit(async () => {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=USA&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DealerHunt/1.0' }
    });
    const data = await res.json();
    if (data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  });
}

export async function geocodeUncodedDeals() {
  const supabase = createClient();
  
  const { data: deals } = await supabase
    .from('deals')
    .select('id, location_city, location_state')
    .is('lat', null)
    .not('location_city', 'is', null)
    .not('location_state', 'is', null)
    .limit(50);

  for (const deal of deals || []) {
    const coords = await geocode(deal.location_city, deal.location_state);
    if (coords) {
      await supabase
        .from('deals')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', deal.id);
    }
    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }
}
```

### Map Component

Use existing Leaflet installation.

**Create:** `app/(dashboard)/map/page.tsx`
- Query deals with lat/lng
- Show as Leaflet markers
- Radius filtering
- Color by verdict

**Week 4 Done:** Map working with geocoded deals

---

## Week 5: Alert System Refinement

### Audit Existing

Check `workers/savedCarsChecker.ts` to see what exists.

### Add Missing

- Flash deal notifications
- Outcome reminders (24h, 7d, 30d)
- Weekly summary email

**Week 5 Done:** All notification types working

---

## Week 6: Polish + Launch

- Admin analytics dashboard
- Onboarding flow
- Documentation
- Performance monitoring
- Bug fixes
- Deploy

---

## Summary

| Week | What Gets Built | Why It Matters |
|------|----------------|----------------|
| 1 | Outcome logging | The moat - dealers get locked in |
| 2 | Calibration | Estimates improve, switching cost increases |
| 3 | UI for existing features | Make 60% of backend accessible |
| 4 | Geocoding + Map | Visual intelligence |
| 5 | Alert refinement | Complete notification system |
| 6 | Polish + Launch | Production ready |

**Total: 6 weeks, not 12**

**Why faster:** 
- 60% of backend exists
- Don't rebuild what works
- Focus on gaps only
- Parallel UI + backend work

**Priority:** Outcome logging > Calibration > UI > Everything else
