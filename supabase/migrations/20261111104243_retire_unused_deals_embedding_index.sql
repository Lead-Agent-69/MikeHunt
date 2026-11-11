-- The HNSW graph has zero scans in the measured production statistics.
-- The app's similarity RPCs rank candidates against the selected listing's
-- vector after applying their filters. Keep the vectors and all RPCs intact.
-- For a busy production database, run DROP INDEX CONCURRENTLY first, then
-- apply this idempotent migration normally.
-- Rollback: CREATE INDEX CONCURRENTLY deals_embedding_idx ON public.deals
-- USING hnsw (embedding vector_cosine_ops);
DROP INDEX IF EXISTS public.deals_embedding_idx;
