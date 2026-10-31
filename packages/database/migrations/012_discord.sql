BEGIN;
CREATE TABLE IF NOT EXISTS atlas.discord_connections (
 user_id uuid PRIMARY KEY REFERENCES atlas.users(id) ON DELETE CASCADE,
 webhook_url text NOT NULL, connected_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS atlas.discord_deliveries (
 notification_id uuid PRIMARY KEY REFERENCES atlas.notifications(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'sent', sent_at bigint NOT NULL, last_error text
);
ALTER TABLE atlas.discord_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.discord_deliveries ENABLE ROW LEVEL SECURITY;
COMMIT;
