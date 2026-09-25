-- Denormalize a couple of decoded signals onto the deal so the grid cards can show them without a
-- per-card API call. Populated from vin_decodes during canonicalization.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS body_class    TEXT,
  ADD COLUMN IF NOT EXISTS recalls_count INT;
