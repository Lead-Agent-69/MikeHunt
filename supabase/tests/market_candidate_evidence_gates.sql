-- Disposable local verification only; fixtures and grants roll back.
begin;
insert into public.deals(id, active, deal_analysis)
select ('20000000-0000-4000-8000-' || lpad(ordinality::text,12,'0'))::uuid,
       true, value
from unnest(array[
  null::jsonb, 'null'::jsonb, 'true'::jsonb, '42'::jsonb, '"bad"'::jsonb,
  '[]'::jsonb, '[{"evidenceGates":true}]'::jsonb, '{}'::jsonb,
  '{"evidenceGates":null}'::jsonb, '{"evidenceGates":false}'::jsonb,
  '{"evidenceGates":"true"}'::jsonb, '{"evidenceGates":42}'::jsonb,
  '{"evidenceGates":[]}'::jsonb, '{"evidenceGates":{}}'::jsonb,
  '{"evidenceGates":{"costsConfirmed":true,"titleReviewed":false}}'::jsonb,
  '{"evidenceGates":{"costsConfirmed":"true","conditionInspected":{}}}'::jsonb
]) with ordinality as variants(value, ordinality);

do $$
begin
  -- SQL NULL and JSON null both encode as API null. Check wire-value parity,
  -- while explicitly proving the one physical SQL-nullness distinction.
  if exists (
    select 1 from public.deals d join public.market_candidate_projection v using(id)
    where d.id::text like '20000000-%'
      and jsonb_build_array(d.deal_analysis->'evidenceGates')
          is distinct from jsonb_build_array(v.evidence_gates)
  ) then raise exception 'Serialized evidence gate parity failed'; end if;
  if (select count(*) from public.deals d join public.market_candidate_projection v using(id)
      where d.id::text like '20000000-%'
      and (d.deal_analysis->'evidenceGates') is distinct from v.evidence_gates) <> 1
  then raise exception 'Unexpected SQL nullness distinction'; end if;
  if (select evidence_gates->'costsConfirmed' from public.market_candidate_projection
      where id='20000000-0000-4000-8000-000000000015') is distinct from 'true'::jsonb
     or (select evidence_gates->'costsConfirmed' from public.market_candidate_projection
      where id='20000000-0000-4000-8000-000000000016') is distinct from '"true"'::jsonb
  then raise exception 'Gate booleans were coerced'; end if;
end $$;
rollback;
