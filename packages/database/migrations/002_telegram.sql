BEGIN;
CREATE TABLE IF NOT EXISTS atlas.telegram_connections (
 user_id uuid PRIMARY KEY REFERENCES atlas.users(id) ON DELETE CASCADE,
 chat_id text UNIQUE NOT NULL, enabled boolean NOT NULL DEFAULT true,
 connected_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS atlas.telegram_links (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES atlas.users(id) ON DELETE CASCADE,
 expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS atlas.telegram_deliveries (
 notification_id uuid PRIMARY KEY REFERENCES atlas.notifications(id) ON DELETE CASCADE,
 chat_id text NOT NULL, connected_at bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 next_attempt bigint NOT NULL, provider_id text, last_error text
);
GRANT SELECT,INSERT,UPDATE,DELETE ON atlas.telegram_connections,atlas.telegram_links TO atlas_request;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['telegram_connections','telegram_links'] LOOP
  EXECUTE format('ALTER TABLE atlas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE atlas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS owner_access ON atlas.%I',t);
  EXECUTE format('CREATE POLICY owner_access ON atlas.%I TO atlas_request USING (user_id=atlas.request_user()) WITH CHECK (user_id=atlas.request_user())',t);
  EXECUTE format('DROP POLICY IF EXISTS service_access ON atlas.%I',t);
  EXECUTE format('CREATE POLICY service_access ON atlas.%I TO %I USING (true) WITH CHECK (true)',t,current_user);
 END LOOP;
END $$;
REVOKE ALL ON atlas.telegram_connections,atlas.telegram_links,atlas.telegram_deliveries FROM PUBLIC;
INSERT INTO atlas.migrations(version) VALUES('002_telegram') ON CONFLICT DO NOTHING;
COMMIT;
