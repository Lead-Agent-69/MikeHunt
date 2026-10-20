-- Preserve historical values, but require explicit complete costs for new profit calculations.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.deal_outcomes
  ADD COLUMN IF NOT EXISTS actual_buyer_fees numeric(12,2),
  ADD COLUMN IF NOT EXISTS actual_tax_title numeric(12,2),
  ADD COLUMN IF NOT EXISTS actual_holding numeric(12,2),
  ADD COLUMN IF NOT EXISTS actual_selling numeric(12,2),
  ADD COLUMN IF NOT EXISTS actual_other numeric(12,2),
  ADD COLUMN IF NOT EXISTS actual_all_in_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS costs_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS costs_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS prediction_basis text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS prediction_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['purchase_price','sell_price','actual_buyer_fees','actual_tax_title','actual_recon','actual_transport','actual_holding','actual_selling','actual_other'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.deal_outcomes'::regclass AND conname='outcomes_ledger_' || col) THEN
      EXECUTE format('ALTER TABLE public.deal_outcomes ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I >= 0 AND %I <= 100000000 AND %I = round(%I, 2))) NOT VALID', 'outcomes_ledger_' || col, col, col, col, col, col);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_outcome_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.revision := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.revision + 1 END;
  NEW.updated_at := clock_timestamp();
  IF TG_OP = 'UPDATE' THEN
    NEW.predicted_profit := OLD.predicted_profit;
    NEW.predicted_sell := OLD.predicted_sell;
    NEW.predicted_transport := OLD.predicted_transport;
    NEW.predicted_recon := OLD.predicted_recon;
    NEW.prediction_basis := OLD.prediction_basis;
    NEW.prediction_captured_at := OLD.prediction_captured_at;
  ELSIF current_user NOT IN ('postgres','service_role') THEN
    NEW.predicted_profit := NULL;
    NEW.predicted_sell := NULL;
    NEW.predicted_transport := NULL;
    NEW.predicted_recon := NULL;
    NEW.prediction_basis := 'none';
    NEW.prediction_captured_at := NULL;
  END IF;
  -- Costs entered by an owner are reported evidence, never independently verified sale proof.
  IF NEW.costs_complete THEN
    IF NEW.purchase_price IS NULL OR NEW.purchase_price <= 0 OR NEW.purchase_price > 100000000
      OR NEW.purchased_at IS NULL OR NEW.purchased_at > now()
      OR NEW.actual_buyer_fees IS NULL OR NEW.actual_tax_title IS NULL
      OR NEW.actual_recon IS NULL OR NEW.actual_transport IS NULL
      OR NEW.actual_holding IS NULL OR NEW.actual_selling IS NULL OR NEW.actual_other IS NULL THEN
      RAISE EXCEPTION 'Complete costs require purchase date and every actual expense, including explicit zeros.' USING ERRCODE='23514';
    END IF;
    NEW.actual_fees := NEW.actual_buyer_fees + NEW.actual_tax_title + NEW.actual_holding + NEW.actual_selling + NEW.actual_other;
    NEW.actual_all_in_cost := NEW.purchase_price + NEW.actual_transport + NEW.actual_recon + NEW.actual_fees;
    NEW.costs_confirmed_at := now();
  ELSE
    NEW.actual_all_in_cost := NULL;
    NEW.costs_confirmed_at := NULL;
  END IF;
  NEW.actual_profit := NULL;
  IF NEW.sell_price IS NOT NULL THEN
    IF NEW.sell_price < 0 OR NEW.sell_price > 100000000 THEN
      RAISE EXCEPTION 'Sale price must be nonnegative and finite.' USING ERRCODE='23514';
    END IF;
    IF NEW.costs_complete AND (NEW.sold_at IS NULL OR NEW.sold_at < NEW.purchased_at OR NEW.sold_at > now()) THEN
      RAISE EXCEPTION 'A complete sale needs valid purchase and sale dates.' USING ERRCODE='23514';
    END IF;
    IF NEW.costs_complete THEN
      NEW.actual_profit := NEW.sell_price - NEW.actual_all_in_cost;
    END IF;
  END IF;
  IF NEW.sold_at IS NOT NULL AND NEW.purchased_at IS NOT NULL AND NEW.sold_at >= NEW.purchased_at AND NEW.sell_price >= 0 THEN
    NEW.days_to_sell := (NEW.sold_at AT TIME ZONE 'UTC')::date - (NEW.purchased_at AT TIME ZONE 'UTC')::date;
  ELSE
    NEW.days_to_sell := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_outcome_ledger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_outcome_ledger ON public.deal_outcomes;
CREATE TRIGGER enforce_outcome_ledger BEFORE INSERT OR UPDATE ON public.deal_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_outcome_ledger();

ALTER TABLE public.deal_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_outcomes ON public.deal_outcomes;
CREATE POLICY own_outcomes ON public.deal_outcomes FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
COMMENT ON COLUMN public.deal_outcomes.costs_complete IS 'Owner confirms every actual cost; not independent verification. Legacy and auto-seeded rows remain false until reviewed.';
NOTIFY pgrst, 'reload schema';
COMMIT;
