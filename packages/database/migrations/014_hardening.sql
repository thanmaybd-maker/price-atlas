BEGIN;
-- Pin the search path of the app-owned helper (Supabase advisor: function_search_path_mutable).
ALTER FUNCTION atlas.request_user() SET search_path = pg_catalog, atlas;
-- Covering indexes for foreign keys (Supabase advisor: unindexed_foreign_keys). These also
-- serve the hot paths: offers() joins, rule evaluation per product, per-user alert lists.
CREATE INDEX IF NOT EXISTS current_offers_observation_id_idx ON atlas.current_offers(observation_id);
CREATE INDEX IF NOT EXISTS listings_product_id_idx ON atlas.listings(product_id);
CREATE INDEX IF NOT EXISTS notifications_rule_id_idx ON atlas.notifications(rule_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON atlas.notifications(user_id);
CREATE INDEX IF NOT EXISTS quarantine_listing_id_idx ON atlas.quarantine(listing_id);
CREATE INDEX IF NOT EXISTS reports_user_id_idx ON atlas.reports(user_id);
CREATE INDEX IF NOT EXISTS rules_product_id_idx ON atlas.rules(product_id);
CREATE INDEX IF NOT EXISTS rules_user_id_idx ON atlas.rules(user_id);
CREATE INDEX IF NOT EXISTS telegram_links_user_id_idx ON atlas.telegram_links(user_id);
CREATE INDEX IF NOT EXISTS test_alerts_user_id_idx ON atlas.test_alerts(user_id);
CREATE INDEX IF NOT EXISTS watches_product_id_idx ON atlas.watches(product_id);
COMMIT;
