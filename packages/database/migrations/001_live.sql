BEGIN;
CREATE SCHEMA IF NOT EXISTS atlas;
CREATE TABLE IF NOT EXISTS atlas.migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS atlas.products(id text PRIMARY KEY, slug text UNIQUE NOT NULL, data jsonb NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.users(id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL, verified boolean NOT NULL DEFAULT false, notifications integer NOT NULL DEFAULT 1 CHECK(notifications IN (0,1)), email_enabled boolean NOT NULL DEFAULT false, suppressed boolean NOT NULL DEFAULT false, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.tombstones(user_id uuid PRIMARY KEY, deleted_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.watches(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES atlas.users(id) ON DELETE CASCADE, product_id text NOT NULL REFERENCES atlas.products(id), collection text NOT NULL, created_at bigint NOT NULL, UNIQUE(user_id,product_id));
CREATE TABLE IF NOT EXISTS atlas.rules(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES atlas.users(id) ON DELETE CASCADE, product_id text NOT NULL REFERENCES atlas.products(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.listings(id text PRIMARY KEY, product_id text NOT NULL REFERENCES atlas.products(id), store text NOT NULL CHECK(store IN ('Amazon','Flipkart')), external_id text NOT NULL, url text NOT NULL, evidence jsonb NOT NULL, match_state text NOT NULL DEFAULT 'accepted' CHECK(match_state IN ('accepted','review','rejected')), next_check bigint NOT NULL, failures integer NOT NULL DEFAULT 0, last_success bigint, UNIQUE(store,external_id));
CREATE INDEX IF NOT EXISTS listings_due ON atlas.listings(next_check);
CREATE TABLE IF NOT EXISTS atlas.observations(id text PRIMARY KEY, product_id text NOT NULL REFERENCES atlas.products(id), listing_id text NOT NULL REFERENCES atlas.listings(id), run_key text NOT NULL, data jsonb NOT NULL, observed_at bigint NOT NULL, expires_at bigint NOT NULL, UNIQUE(listing_id,run_key));
CREATE INDEX IF NOT EXISTS observations_history ON atlas.observations(product_id,observed_at);
CREATE TABLE IF NOT EXISTS atlas.current_offers(listing_id text PRIMARY KEY REFERENCES atlas.listings(id) ON DELETE CASCADE, observation_id text NOT NULL REFERENCES atlas.observations(id) ON DELETE CASCADE, observed_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.notifications(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES atlas.users(id) ON DELETE CASCADE, rule_id uuid NOT NULL REFERENCES atlas.rules(id) ON DELETE CASCADE, event_key text UNIQUE NOT NULL, data jsonb NOT NULL, state text NOT NULL DEFAULT 'pending', email_state text NOT NULL DEFAULT 'pending', provider_id text, attempts integer NOT NULL DEFAULT 0, first_attempt bigint, next_attempt bigint NOT NULL, created_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS notification_due ON atlas.notifications(next_attempt) WHERE email_state='pending';
CREATE TABLE IF NOT EXISTS atlas.jobs(id text PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending', available_at bigint NOT NULL, lease_until bigint, attempts integer NOT NULL DEFAULT 0, last_error text, created_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_due ON atlas.jobs(state,available_at);
CREATE TABLE IF NOT EXISTS atlas.provider_state(store text PRIMARY KEY, paused integer NOT NULL DEFAULT 0 CHECK(paused IN (0,1)), policy jsonb, window_start bigint NOT NULL DEFAULT 0, requests integer NOT NULL DEFAULT 0, last_error text);
INSERT INTO atlas.provider_state(store) VALUES('Amazon'),('Flipkart') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS atlas.runs(id text PRIMARY KEY, started_at bigint NOT NULL, completed_at bigint, status text NOT NULL, observations integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS atlas.reports(id uuid PRIMARY KEY, user_id uuid REFERENCES atlas.users(id) ON DELETE SET NULL, product_id text NOT NULL, reason text NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.audit(id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, reason text NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.quarantine(id text PRIMARY KEY, listing_id text NOT NULL REFERENCES atlas.listings(id), data jsonb NOT NULL, reason text NOT NULL, state text NOT NULL DEFAULT 'review', created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS atlas.webhook_events(id text PRIMARY KEY, kind text NOT NULL, created_at bigint NOT NULL);

-- No table is exposed to Supabase anon/authenticated roles. Request transactions
-- drop to a dedicated role; identity is populated only after Auth verifies it.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='atlas_request') THEN CREATE ROLE atlas_request NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT atlas_request TO CURRENT_USER;
GRANT USAGE ON SCHEMA atlas TO atlas_request;
GRANT SELECT ON atlas.products TO atlas_request;
GRANT SELECT,INSERT,UPDATE,DELETE ON atlas.users,atlas.watches,atlas.rules,atlas.notifications,atlas.reports TO atlas_request;
CREATE OR REPLACE FUNCTION atlas.request_user() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('atlas.user_id',true),'')::uuid $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','watches','rules','notifications','reports'] LOOP
  EXECUTE format('ALTER TABLE atlas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE atlas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS owner_access ON atlas.%I',t);
  EXECUTE format('CREATE POLICY owner_access ON atlas.%I TO atlas_request USING (%I=atlas.request_user()) WITH CHECK (%I=atlas.request_user())',t,CASE WHEN t='users' THEN 'id' ELSE 'user_id' END,CASE WHEN t='users' THEN 'id' ELSE 'user_id' END);
 END LOOP;
END $$;
-- The trusted service connection must retain its normal owner access.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','watches','rules','notifications','reports'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS service_access ON atlas.%I',t);
  EXECUTE format('CREATE POLICY service_access ON atlas.%I TO %I USING (true) WITH CHECK (true)',t,current_user);
 END LOOP;
END $$;
REVOKE ALL ON SCHEMA atlas FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA atlas FROM PUBLIC;
INSERT INTO atlas.migrations(version) VALUES('001_live') ON CONFLICT DO NOTHING;
COMMIT;
