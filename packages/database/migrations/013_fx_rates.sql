CREATE TABLE IF NOT EXISTS atlas.fx_rates (
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric NOT NULL,
  rate_date date NOT NULL,
  fetched_at bigint NOT NULL,
  source text NOT NULL DEFAULT 'Frankfurter (ECB reference rate)',
  PRIMARY KEY (base_currency, target_currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON atlas.fx_rates (base_currency, target_currency, rate_date DESC);
