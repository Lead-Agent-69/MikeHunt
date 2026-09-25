-- Active-states registry for the demand-driven housing harvest. Applied to prod via MCP on 2026-07-07;
-- committed here so a fresh rebuild has it. The on-market MLS sources (Redfin GIS, portals, RESO) scope to
-- these states only; off-market sources stay nationwide. A user picking a housing state adds a row → server
-- power goes where the demand is.
CREATE TABLE IF NOT EXISTS public.harvest_states (
  state text PRIMARY KEY,                            -- uppercase 2-letter code
  source text NOT NULL DEFAULT 'demand',             -- 'seed' | 'demand'
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.harvest_states ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "harvest_states_read" ON public.harvest_states FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.harvest_states (state, source) VALUES ('MO','seed'), ('IL','seed')
  ON CONFLICT (state) DO NOTHING;
