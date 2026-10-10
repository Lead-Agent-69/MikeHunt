# LOCAL seed: 5,000 deals derived from the real 1,000-row prod sample (5 perturbed copies), price
# history, and sold comps (496 real Norfolk impound sales + 1,500 synthetic retail comps derived from
# the sample's make/model/ask). Writes seed.sql for psql. Never touches prod.
# Usage: python3 seed.py <deals.json from GET /api/deals?limit=1000> <norfolk_sold.json from data.norfolk.gov 4dwc-v3t8>
import json, random, sys, uuid, datetime as dt
random.seed(42)
rows = json.load(open(sys.argv[1]))['deals']
cent = {'AL':(32.8,-86.8),'AZ':(34.2,-111.7),'CA':(37.2,-119.4),'CO':(39.0,-105.5),'FL':(28.6,-82.4),'GA':(32.7,-83.4),'IL':(40.0,-89.2),'IN':(39.9,-86.3),'KY':(37.5,-85.3),'MI':(44.3,-85.4),'MN':(46.3,-94.3),'MO':(38.4,-92.5),'NC':(35.6,-79.4),'NJ':(40.2,-74.7),'NY':(42.9,-75.5),'OH':(40.3,-82.8),'PA':(40.9,-77.8),'TN':(35.9,-86.4),'TX':(31.5,-99.3),'VA':(37.5,-78.8),'WA':(47.4,-120.5),'WI':(44.6,-89.9)}
now = dt.datetime(2026, 10, 10, 8, 0, tzinfo=dt.timezone.utc)
def q(v):
    if v is None: return '\\N'
    return str(v).replace('\\','\\\\').replace('\t',' ').replace('\n',' ')
deals, ph = [], []
for k in range(5):
    for r in rows:
        did = str(uuid.uuid4()); f = 1 + random.uniform(-0.08, 0.08) if k else 1.0
        ask = max(300, int(round((r['askPrice'] or 1000) * f, -1)))
        sell = r.get('sellEstimate'); sell = int(float(sell) * f) if sell else None
        costs = (r.get('estimated_transport_cost') or 0) + (r.get('estimated_repair_cost') or 0)
        tnp = (sell - ask - costs) if sell else 0
        st = r.get('locationState') if r.get('locationState') in cent else random.choice(list(cent))
        la, lo = cent[st]; la += random.uniform(-1.5, 1.5); lo += random.uniform(-1.5, 1.5)
        mil = r.get('mileage'); mil = int(mil * (1 + random.uniform(-0.1, 0.1))) if mil and k else mil
        first = now - dt.timedelta(days=random.randint(0, 45), hours=random.randint(0, 23))
        drop = random.choice([0,0,0,0,250,500,1000]) if k else (r.get('priceDropAmount') or 0)
        cond = r.get('condition') or '\\N'
        deals.append([did, r['source'], f"seed{k}-{r['id']}", r['sourceUrl'], r['title'], r['year'] or 2015, r['make'] or 'Unknown', r['model'] or 'Unknown', r.get('trim'),
            r.get('vin') if k == 0 else None, mil, cond, ask, sell, tnp, max(0, min(100, 50 + tnp // 400)) if sell else None,
            '{' + ','.join('"%s"' % i.replace('"','') for i in (r.get('images') or [])[:6]) + '}', r.get('locationCity'), st, r.get('locationZip'), round(la, 5), round(lo, 5),
            'true' if k < 4 else random.choice(['true','false']), first.isoformat(), (now - dt.timedelta(hours=random.randint(0, 30))).isoformat(),
            r.get('estimated_transport_cost') or 0, r.get('estimated_repair_cost') or 0, drop, r.get('damageType')])
        if random.random() < 0.35:
            p0 = ask + random.choice([500, 1000, 1500, 2500])
            ph.append([did, p0, (first).isoformat()]); ph.append([did, ask, (first + dt.timedelta(days=random.randint(2, 20))).isoformat()])
cols = 'id,source,source_deal_id,source_url,title,year,make,model,trim,vin,mileage,condition,ask_price,sell_estimate,true_net_profit,profit_score,images,location_city,location_state,location_zip,lat,lng,active,first_seen_at,last_seen_at,estimated_transport_cost,estimated_repair_cost,price_drop_amount,damage_type'
out = [f"COPY public.deals ({cols}) FROM stdin;"] + ['\t'.join(q(v) for v in d) for d in deals] + ['\\.']
out += ["COPY public.price_history (deal_id, price, observed_at) FROM stdin;"] + ['\t'.join(q(v) for v in p) for p in ph] + ['\\.']
sold = []
for s in json.load(open(sys.argv[2])):
    if not s.get('vehicle_make') or not s.get('auction_date'): continue
    y = s.get('vehicle_year'); y = int(y) if y and y.isdigit() else None
    sold.append([s.get('vin_number'), y, s['vehicle_make'].title(), (s.get('vehicle_model') or '').title(), None, s['sold_for'], s['auction_date'], 'gov_norfolk_impound', 'VA', 'norfolk-' + (s.get('vin_number') or str(uuid.uuid4())) + '-' + s['auction_date'][:10], None, 'Norfolk impound auction'])
for i in range(1500):
    r = random.choice(rows)
    if not r.get('askPrice') or not r.get('make'): continue
    sold.append([None, r['year'], r['make'], r['model'], r.get('mileage'), int(r['askPrice'] * random.uniform(0.85, 1.0)), (now - dt.timedelta(days=random.randint(1, 170))).isoformat(), 'local_seed', r.get('locationState'), f'seed-{i}', None, r['title']])
out += ["COPY public.sold_listings (vin, year, make, model, mileage, sold_price, sold_at, source, location_state, source_item_id, source_url, title) FROM stdin;"] + ['\t'.join(q(v) for v in s) for s in sold] + ['\\.']
open('seed.sql', 'w').write('\n'.join(out) + '\n')
print(len(deals), 'deals', len(ph), 'price_history', len(sold), 'sold')
