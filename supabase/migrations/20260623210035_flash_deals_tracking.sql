-- Add flash_alert_sent to track which flash deals have triggered notifications
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS flash_alert_sent BOOLEAN DEFAULT false;

-- Create an index to quickly find unsent flash deals
CREATE INDEX IF NOT EXISTS deals_flash_alert_idx 
ON public.deals(flash_alert_sent, profit_score DESC) 
WHERE deal_verdict = 'go';
