import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const container = "supabase_db_MikeHunt";
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error("Local Docker defaults only");
const context = execFileSync("docker", ["context", "show"], { encoding: "utf8" }).trim();
const endpoint = JSON.parse(execFileSync("docker", ["context", "inspect", context], { encoding: "utf8" }))[0].Endpoints.docker.Host;
if (!["default", "desktop-linux"].includes(context) || !endpoint.startsWith("npipe://")) throw new Error("Local Docker Desktop named pipe required");
const local = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
if (local?.Config?.Labels?.["com.supabase.cli.project"] !== "MikeHunt") throw new Error("Expected local Supabase container");
const database = `qa_feedback_${Date.now()}`;
let created = false;
const sql = (db, input) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
try {
  sql("postgres", `create database ${database};`);
  created = true;
  sql(database, `create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth, public to authenticated, anon, service_role;
    create table public.deals(id uuid primary key, ask_price numeric, sell_estimate numeric, options jsonb, deal_analysis jsonb, active boolean default true, lat double precision, lng double precision);
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    insert into deals values ('33333333-3333-4333-8333-333333333333');`);
  sql(database, readFileSync("supabase/migrations/20261016005413_listing_feedback.sql", "utf8"));
  sql(database, readFileSync("supabase/migrations/20261016005724_qualified_listing_margin.sql", "utf8"));
  sql(database, readFileSync("supabase/migrations/20261016011958_radius_inventory_search.sql", "utf8"));
  sql(database, `alter table public.deals add column future_inventory_field text;
    select * from public.inventory_within_radius(38.63,-90.2,50);`);
  sql(database, `insert into deals (id,lat,lng) values
    ('55555555-5555-4555-8555-555555555551',38.63,-90.2),
    ('55555555-5555-4555-8555-555555555552',38.52,-89.98),
    ('55555555-5555-4555-8555-555555555553',41.88,-87.63),
    ('55555555-5555-4555-8555-555555555554',0,-179.9),
    ('55555555-5555-4555-8555-555555555555',89.9,-179.9);
    do $$ begin
      if (select count(*) from public.inventory_within_radius(38.63,-90.2,50)) <> 2 then raise exception 'CROSS BORDER RADIUS FAILED'; end if;
      if (select count(*) from public.inventory_within_radius(0,179.9,50)) <> 1 then raise exception 'DATELINE RADIUS FAILED'; end if;
      if (select count(*) from public.inventory_within_radius(89.9,0,50)) <> 1 then raise exception 'POLAR RADIUS FAILED'; end if;
      if has_function_privilege('anon','public.inventory_within_radius(double precision,double precision,double precision)','execute') or has_function_privilege('authenticated','public.inventory_within_radius(double precision,double precision,double precision)','execute') then raise exception 'PUBLIC RADIUS RPC'; end if;
    end $$;`);
  sql(database, `insert into deals(id,ask_price,sell_estimate,options,deal_analysis)
    select gen_random_uuid(),10000,15000,'{"priceEvidence":{"kind":"asking","askingPrice":10000}}', '{"valuation":{"source":"comparables","resaleEvidence":true}}';
    insert into deals(id,ask_price,sell_estimate,options,deal_analysis)
    select gen_random_uuid(),10000,15000, e::jsonb, '{"valuation":{"source":"comparables","resaleEvidence":true}}'
    from (values ('{"priceEvidence":{"kind":"down_payment","askingPrice":10000}}'),
                 ('{"priceEvidence":{"kind":"asking","askingPrice":2180}}'),
                 ('{"priceEvidence":{"kind":"asking","askingPrice":"bad"}}')) bad(e);
    insert into deals(id,ask_price,sell_estimate,options,deal_analysis)
    select gen_random_uuid(),10000,15000,'{"priceEvidence":{"kind":"asking","askingPrice":10000}}', e::jsonb
    from (values ('{"valuation":{"source":"comparables","resaleEvidence":false}}'),
                 ('{"valuation":{"source":"asking_price","resaleEvidence":true}}'),
                 ('{"priceImplausible":true,"valuation":{"source":"comparables","resaleEvidence":true}}')) bad(e);
    do $$ begin
      if (select count(*) from deals where deal_margin is not null) <> 1 or
         (select max(deal_margin) from deals) <> 5000 then raise exception 'UNQUALIFIED MARGIN'; end if;
    end $$;
    update deals set sell_estimate=16000 where deal_margin is not null;
    do $$ begin if (select deal_margin from deals where deal_margin is not null order by deal_margin desc limit 1) <> 6000 then raise exception 'MARGIN DID NOT REFRESH'; end if; end $$;`);
  sql(database, `set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
    insert into feedback(id,user_id,listing_id,category,comment) values ('44444444-4444-4444-8444-444444444444', auth.uid(), '33333333-3333-4333-8333-333333333333','price','Seller asking price differs');
    do $$ begin
      begin insert into feedback(user_id,category,comment) values ('22222222-2222-4222-8222-222222222222','price','forged'); raise exception 'FORGED OWNER ACCEPTED' using errcode='XX000'; exception when insufficient_privilege then null; end;
      begin update feedback set comment='changed'; raise exception 'UPDATE ACCEPTED' using errcode='XX000'; exception when insufficient_privilege then null; end;
      begin delete from feedback; raise exception 'DELETE ACCEPTED' using errcode='XX000'; exception when insufficient_privilege then null; end;
      begin insert into feedback(user_id,category,comment,created_at) values (auth.uid(),'price','backdate',now()); raise exception 'CREATED_AT ACCEPTED' using errcode='XX000'; exception when insufficient_privilege then null; end;
      begin insert into feedback(user_id,category,comment) values(auth.uid(),'price',repeat('x',2001)); raise exception 'OVERSIZE ACCEPTED' using errcode='XX000'; exception when check_violation then null; end;
    end $$;
    insert into feedback(user_id,category,comment) select auth.uid(),'other','report ' || n from generate_series(1,19) seq(n);
    do $$ begin
      begin insert into feedback(user_id,category,comment) values(auth.uid(),'other','21st'); raise exception 'DAILY CAP NOT ENFORCED' using errcode='XX000'; exception when raise_exception then
        if sqlerrm <> 'Daily feedback limit reached' then raise; end if;
      end;
    end $$;
    set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
    do $$ begin if (select count(*) from feedback) <> 0 then raise exception 'OTHER OWNER VISIBLE'; end if; end $$;
    insert into feedback(user_id,category,comment) values(auth.uid(),'other','second owner');
    reset role;
    delete from deals where id = '33333333-3333-4333-8333-333333333333';
    do $$ begin if (select count(*) from feedback where id = '44444444-4444-4444-8444-444444444444' and listing_id is null) <> 1 then raise exception 'REPORT LOST ON LISTING DELETE'; end if; end $$;
    set role anon;
    do $$ begin begin perform count(*) from feedback; raise exception 'ANON READ ACCEPTED' using errcode='XX000'; exception when insufficient_privilege then null; end; end $$;
    reset role; set role service_role;
    do $$ begin if (select count(*) from feedback) <> 21 then raise exception 'OPERATOR READ FAILED'; end if; end $$;`);
  console.log("PASS: actual local PostgreSQL grants, ownership, immutability, size cap, daily quota, report survival and operator read");
} finally {
  if (created) sql("postgres", `drop database ${database} with (force);`);
}
