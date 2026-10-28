BEGIN;
ALTER TABLE atlas.listings DROP CONSTRAINT IF EXISTS listings_store_check;
ALTER TABLE atlas.listings ADD CONSTRAINT listings_store_check CHECK(store IN ('Amazon','Flipkart','Meesho','Croma','Nykaa','iHerb','B&H'));
INSERT INTO atlas.provider_state(store) VALUES('Meesho'),('Croma'),('Nykaa'),('iHerb'),('B&H') ON CONFLICT DO NOTHING;
INSERT INTO atlas.migrations(version) VALUES('007_retailers') ON CONFLICT DO NOTHING;
COMMIT;
