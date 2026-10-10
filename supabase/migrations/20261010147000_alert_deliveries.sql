-- Alert delivery tracking (production gap audit, section VI-A).
-- One row per (notification, channel, device). The row id is a random UUID and doubles as the
-- opaque token in open-pixel / click-redirect / push-receipt URLs, so no URL ever carries an email,
-- phone number or user id. Service-role only: RLS on with no policies, and no anon/authenticated
-- grants. Admins read it through /api/admin/alert-deliveries (server-side admin gate).
--
-- NOT applied automatically. Apply to hosted Supabase before the tracking code can record rows;
-- until then every tracking write fails soft and alerts send exactly as before.

CREATE TABLE IF NOT EXISTS public.alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- What produced the notification.
  kind TEXT NOT NULL CHECK (kind IN ('saved_search_match', 'price_drop', 'alert_match')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  search_id UUID REFERENCES public.user_saved_searches(id) ON DELETE SET NULL,
  -- Where a click goes. Never a free-form URL from a request: 'deal' = our own /deal/<deal_id>,
  -- 'listing' = the deal's stored source_url (looked up server-side at click time).
  click_target TEXT NOT NULL DEFAULT 'deal' CHECK (click_target IN ('deal', 'listing')),
  -- Provider id for webhook correlation (Resend email id, Twilio SID). Push has none.
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0,
  click_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_created ON public.alert_deliveries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_user ON public.alert_deliveries (user_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_provider
  ON public.alert_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_deal ON public.alert_deliveries (deal_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_search ON public.alert_deliveries (search_id);

ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alert_deliveries FROM anon, authenticated;

-- Atomic engagement bump used by the pixel / click / receipt routes (service role only).
CREATE OR REPLACE FUNCTION public.alert_delivery_event(p_id UUID, p_event TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.alert_deliveries SET
    delivered_at = CASE WHEN p_event IN ('delivered', 'opened', 'clicked')
                        THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
    opened_at    = CASE WHEN p_event IN ('opened', 'clicked')
                        AND channel = 'email' THEN COALESCE(opened_at, NOW()) ELSE opened_at END,
    clicked_at   = CASE WHEN p_event = 'clicked' THEN COALESCE(clicked_at, NOW()) ELSE clicked_at END,
    open_count   = open_count + CASE WHEN p_event = 'opened' THEN 1 ELSE 0 END,
    click_count  = click_count + CASE WHEN p_event = 'clicked' THEN 1 ELSE 0 END,
    status = CASE
      WHEN status IN ('failed', 'bounced') THEN status
      WHEN p_event = 'clicked' OR status = 'clicked' THEN 'clicked'
      WHEN p_event = 'opened' OR status = 'opened' THEN 'opened'
      ELSE 'delivered'
    END
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.alert_delivery_event(UUID, TEXT) FROM PUBLIC, anon, authenticated;
