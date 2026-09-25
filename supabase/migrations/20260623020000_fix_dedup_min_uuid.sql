-- Fix detect_duplicates_by_vin: it used MIN(id) where id is a uuid, and Postgres has no
-- min(uuid) — so every dedup pass threw "function min(uuid) does not exist" and no duplicates were
-- ever marked. Pick the canonical row as the EARLIEST-created one (keep the original, flag newer
-- copies) via array_agg ... ORDER BY, which works on uuid.

CREATE OR REPLACE FUNCTION public.detect_duplicates_by_vin(vin_filter text[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.deals d
    SET duplicate_of_id = c.canonical_id,
        duplicate_confidence = 1.0
    FROM (
        SELECT vin,
               (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS canonical_id
        FROM public.deals
        WHERE vin IS NOT NULL
          AND duplicate_of_id IS NULL
          AND (vin_filter IS NULL OR vin = ANY(vin_filter))
        GROUP BY vin
        HAVING COUNT(*) > 1
    ) c
    WHERE d.vin = c.vin
      AND d.id <> c.canonical_id;
END;
$$;
