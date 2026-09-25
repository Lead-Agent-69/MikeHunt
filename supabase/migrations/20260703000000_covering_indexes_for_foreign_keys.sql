-- Covering indexes for foreign keys flagged by the Supabase performance advisor (unindexed FKs slow
-- joins + cascade deletes). All IF NOT EXISTS (additive/safe). Applied to prod 2026-07-02.

create index if not exists idx_alert_log_deal_id on alert_log (deal_id);
create index if not exists idx_alert_matches_alert_id on alert_matches (alert_id);
create index if not exists idx_alert_matches_deal_id on alert_matches (deal_id);
create index if not exists idx_alerts_user_id on alerts (user_id);
create index if not exists idx_api_keys_user_id on api_keys (user_id);
create index if not exists idx_deal_outcomes_deal_id on deal_outcomes (deal_id);
create index if not exists idx_deal_outcomes_inventory_id on deal_outcomes (inventory_id);
create index if not exists idx_deals_dealer_id on deals (dealer_id);
create index if not exists idx_housing_feed_inbox_search_id on housing_feed_inbox (search_id);
create index if not exists idx_inventory_deal_id on inventory (deal_id);
create index if not exists idx_parts_estimates_inventory_id on parts_estimates (inventory_id);
create index if not exists idx_recon_stages_dealer_id on recon_stages (dealer_id);
create index if not exists idx_recon_stages_inventory_id on recon_stages (inventory_id);
create index if not exists idx_saved_cars_dealer_id on saved_cars (dealer_id);
create index if not exists idx_source_url_cache_deal_id on source_url_cache (deal_id);
create index if not exists idx_transport_routes_dealer_id on transport_routes (dealer_id);
create index if not exists idx_transports_dealer_id on transports (dealer_id);
create index if not exists idx_transports_inventory_id on transports (inventory_id);
create index if not exists idx_user_feed_inbox_deal_id on user_feed_inbox (deal_id);
create index if not exists idx_user_feed_inbox_search_id on user_feed_inbox (search_id);
create index if not exists idx_watchlist_deal_id on watchlist (deal_id);
