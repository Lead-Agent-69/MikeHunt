-- Local-only transactional financial / ownership regression. Never seed production accounts.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('a0110000-0000-4000-8000-000000000001','outcome-ledger-a@local.test'),
 ('a0110000-0000-4000-8000-000000000002','outcome-ledger-b@local.test');
INSERT INTO public.deal_outcomes(id,user_id,purchase_price,sell_price,actual_profit) VALUES
 ('b0110000-0000-4000-8000-000000000001','a0110000-0000-4000-8000-000000000001',10000,16000,999999);
DO $$ BEGIN
 IF (SELECT actual_profit IS NOT NULL OR revision <> 1 FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Unconfirmed profit leaked'; END IF;
END $$;
UPDATE public.deal_outcomes SET
 actual_buyer_fees=1000,actual_tax_title=500,actual_recon=1000,actual_transport=300,
 actual_holding=200,actual_selling=420,actual_other=400,
 purchased_at='2026-09-01',sold_at='2026-10-01',costs_complete=true
 WHERE id='b0110000-0000-4000-8000-000000000001' AND revision=1;
DO $$ BEGIN
 IF NOT (SELECT actual_profit=2180 AND actual_all_in_cost=13820 AND actual_fees=2520 AND days_to_sell=30 AND revision=2 FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Incorrect full cost result'; END IF;
 UPDATE public.deal_outcomes SET sell_price=1 WHERE id='b0110000-0000-4000-8000-000000000001' AND revision=1;
 IF FOUND THEN RAISE EXCEPTION 'Stale revision overwrote saved result'; END IF;
 BEGIN
  UPDATE public.deal_outcomes SET actual_recon=NULL WHERE id='b0110000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'Missing expense accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.deal_outcomes SET actual_transport=-1 WHERE id='b0110000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'Negative expense accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.deal_outcomes SET sell_price='NaN'::numeric WHERE id='b0110000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'Nonfinite amount accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.deal_outcomes SET sold_at='2026-08-01' WHERE id='b0110000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'Reversed sale date accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.deal_outcomes SET purchase_price=10000.123 WHERE id='b0110000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'Subcent price accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE public.deal_outcomes SET actual_recon=0,sell_price=12000,sold_at=purchased_at WHERE id='b0110000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF NOT (SELECT actual_profit=-820 AND days_to_sell=0 FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Loss or same day sale lost'; END IF;
END $$;
UPDATE public.deal_outcomes SET sell_price=0 WHERE id='b0110000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF NOT (SELECT actual_profit=-12820 FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Zero proceeds loss lost'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0110000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Cross account read'; END IF;
 UPDATE public.deal_outcomes SET notes='cross account' WHERE id='b0110000-0000-4000-8000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Cross account update'; END IF;
 BEGIN
  INSERT INTO public.deal_outcomes(user_id,purchase_price) VALUES('a0110000-0000-4000-8000-000000000001',1000);
  RAISE EXCEPTION 'Cross account insert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"a0110000-0000-4000-8000-000000000001","role":"authenticated"}',true);
INSERT INTO public.deal_outcomes(id,user_id,purchase_price,predicted_sell,prediction_basis,prediction_captured_at) VALUES
 ('b0110000-0000-4000-8000-000000000002','a0110000-0000-4000-8000-000000000001',1000,900000,'market_supported',now());
DO $$ BEGIN
 IF NOT (SELECT predicted_sell IS NULL AND prediction_basis='none' AND revision=1 FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Client forged trusted prediction'; END IF;
 UPDATE public.deal_outcomes SET predicted_sell=999999, prediction_basis='market_supported',notes='my record' WHERE id='b0110000-0000-4000-8000-000000000002';
 IF NOT (SELECT predicted_sell IS NULL AND prediction_basis='none' AND revision=2 AND notes='my record' FROM public.deal_outcomes WHERE id='b0110000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Prediction changed or trigger not callable on own update'; END IF;
 BEGIN
  UPDATE public.deal_outcomes SET user_id='a0110000-0000-4000-8000-000000000002' WHERE id='b0110000-0000-4000-8000-000000000002';
  RAISE EXCEPTION 'Owner reassignment accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
