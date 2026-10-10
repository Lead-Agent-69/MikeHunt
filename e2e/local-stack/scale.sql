-- LOCAL ONLY. Phase B: realistic 768-d embeddings on every row (prod embeds active deals).
-- Phase C: grow to 25k rows by cloning seeded rows (source_deal_id 'scale-%' so they can be removed).
\if :{?phase_b}
UPDATE public.deals SET embedding = (SELECT array_agg(random()*2-1) FROM generate_series(1,768) g WHERE deals.id IS NOT NULL);
\endif
\if :{?phase_c}
INSERT INTO public.deals (source, source_deal_id, source_url, title, year, make, model, trim, vin, mileage, condition, ask_price,
  sell_estimate, true_net_profit, profit_score, images, location_city, location_state, location_zip, lat, lng, active,
  first_seen_at, last_seen_at, estimated_transport_cost, estimated_repair_cost, price_drop_amount, damage_type, embedding)
SELECT source, 'scale-' || k || '-' || source_deal_id, source_url, title, year, make, model, trim, NULL, mileage, condition,
  (ask_price * (0.95 + random()*0.1))::int, sell_estimate, true_net_profit, profit_score, images, location_city, location_state,
  location_zip, lat + random() - 0.5, lng + random() - 0.5, active, first_seen_at - (k || ' hours')::interval,
  last_seen_at - (k || ' minutes')::interval, estimated_transport_cost, estimated_repair_cost, price_drop_amount, damage_type, embedding
FROM public.deals d CROSS JOIN generate_series(1,4) k WHERE d.source_deal_id LIKE 'seed%';
ANALYZE public.deals;
\endif
SELECT count(*) AS deals, count(*) FILTER (WHERE active) AS active, count(embedding) AS embedded FROM public.deals;
