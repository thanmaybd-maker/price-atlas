ALTER TABLE atlas.listings DROP CONSTRAINT IF EXISTS listings_store_check;
ALTER TABLE atlas.listings ADD CONSTRAINT listings_store_check CHECK(store IN ('Amazon','Flipkart','Meesho','Croma','Nykaa','Reliance Digital','Myntra','AJIO','iHerb','B&H'));
INSERT INTO atlas.provider_state(store) VALUES('Reliance Digital'),('Myntra'),('AJIO') ON CONFLICT DO NOTHING;
