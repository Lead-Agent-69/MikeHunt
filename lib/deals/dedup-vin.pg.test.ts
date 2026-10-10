// e2e: runs the REAL dedupe_deals (and vin_check_digit_ok) from the migrations against Postgres.
// Skipped unless TEST_DATABASE_URL points at a throwaway database (needs `psql` on PATH and the
// pg_trgm extension available). Each run creates and drops its own schema; never touches public.deals.
//
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55491/postgres npx vitest run lib/deals/dedup-vin.pg.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import samples from "./__fixtures__/prod-deal-samples.json";
import { latestFunctionSql } from "./__fixtures__/migration-sql";

const URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `dedup_test_${process.pid}`;
const psql = (sql: string) =>
  execFileSync("psql", [URL!, "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", sql], {
    encoding: "utf8",
  }).trim();

const f250 = samples.rows.normal_f250; // real prod row, VIN 1FT7W2BT8GED11804
const explorer = samples.rows.bad_check_digit_vin; // real prod row, VIN with a bad check digit
const ID = {
  original: f250.id,
  relist: "00000000-0000-4000-8000-000000000002",
  conflict: "00000000-0000-4000-8000-000000000003",
  noVin: "00000000-0000-4000-8000-000000000004",
  explorer: explorer.id,
  explorer2: "00000000-0000-4000-8000-000000000005",
  fuzzyA: "00000000-0000-4000-8000-00000000000a",
  fuzzyB: "00000000-0000-4000-8000-00000000000b",
  sameHost: "00000000-0000-4000-8000-00000000000c",
};

describe.skipIf(!URL)("dedupe_deals on real Postgres", () => {
  const call = (ids?: string[]) =>
    psql(
      `SET search_path TO ${SCHEMA}, public; SELECT ${SCHEMA}.dedupe_deals(${
        ids ? `ARRAY[${ids.map((i) => `'${i}'::uuid`).join(",")}]` : "NULL"
      });`,
    );
  beforeAll(() => {
    psql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    psql(`CREATE SCHEMA ${SCHEMA};`);
    // The columns dedupe_deals reads/writes, with the same types as public.deals.
    psql(`CREATE TABLE ${SCHEMA}.deals (
      id uuid PRIMARY KEY, source text, source_url text, title text, vin text, year smallint,
      make text, model text, trim text, mileage integer, ask_price integer, location_state char(2),
      location_zip text, location_city text, images text[] DEFAULT '{}', active boolean DEFAULT true,
      first_seen_at timestamptz NOT NULL, created_at timestamptz DEFAULT now(),
      duplicate_of_id uuid, duplicate_confidence numeric(4,3), quality_flags text[],
      profit_score smallint, is_arbitrage_opportunity boolean DEFAULT false);`);
    for (const name of [
      "vin_check_digit_ok",
      "dedupe_deals",
      "detect_duplicates_by_vin",
    ]) {
      const { sql } = latestFunctionSql(name);
      psql(sql.replace(/public\./g, `${SCHEMA}.`));
    }
    const v = (
      id: string,
      host: string,
      vin: string | null,
      make: string,
      model: string,
      at: string,
      extra: { year?: number; miles?: number; price?: number } = {},
    ) =>
      `('${id}', 'independent_dealer', 'https://${host}/${id}', '${f250.title}', ${
        vin ? `'${vin}'` : "NULL"
      }, ${extra.year ?? f250.year}, '${make}', '${model}', ${extra.miles ?? f250.mileage}, ${
        extra.price ?? f250.ask_price
      }, 'TX', '75001', 'Dallas', '${at}')`;
    psql(`INSERT INTO ${SCHEMA}.deals (id, source, source_url, title, vin, year, make, model, mileage, ask_price, location_state, location_zip, location_city, first_seen_at) VALUES
      ${v(ID.original, "a.example", f250.vin, f250.make, f250.model, f250.first_seen_at)},
      ${v(ID.relist, "b.example", f250.vin, f250.make, f250.model, "2026-10-05T00:00:00Z")},
      ${v(ID.conflict, "c.example", f250.vin, "Chevrolet", "Silverado 2500HD", "2026-10-06T00:00:00Z")},
      ${v(ID.noVin, "d.example", null, "Ram", "2500", "2026-10-01T00:00:00Z")},
      ${v(ID.explorer, "e.example", explorer.vin, explorer.make, explorer.model, explorer.first_seen_at, { year: explorer.year, miles: explorer.mileage, price: explorer.ask_price })},
      ${v(ID.explorer2, "f.example", explorer.vin, explorer.make, explorer.model, "2026-10-09T12:00:00Z", { year: explorer.year, miles: explorer.mileage, price: Math.round(explorer.ask_price * 1.1) })},
      ${v(ID.fuzzyA, "g.example", null, "Toyota", "Tacoma", "2026-10-01T00:00:00Z", { year: 2019, miles: 60000, price: 28000 })},
      ${v(ID.fuzzyB, "h.example", null, "TOYOTA", "Tacoma ", "2026-10-03T00:00:00Z", { year: 2019, miles: 60500, price: 28500 })},
      ${v(ID.sameHost, "g.example", null, "Toyota", "Tacoma", "2026-10-04T00:00:00Z", { year: 2019, miles: 60100, price: 28100 })};`);
    call();
  });
  afterAll(() => {
    if (URL) psql(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;`);
  });
  const row = (id: string) =>
    psql(
      `SELECT coalesce(duplicate_of_id::text,'') || '|' || coalesce(duplicate_confidence::text,'') FROM ${SCHEMA}.deals WHERE id='${id}'`,
    );
  const flags = (id: string) =>
    psql(
      `SELECT coalesce(array_to_string(quality_flags, ','), '') FROM ${SCHEMA}.deals WHERE id='${id}'`,
    );

  it("the check digit function agrees with lib/vehicle/vin", () => {
    expect(psql(`SELECT ${SCHEMA}.vin_check_digit_ok('${f250.vin}')`)).toBe(
      "t",
    );
    expect(psql(`SELECT ${SCHEMA}.vin_check_digit_ok('${explorer.vin}')`)).toBe(
      "f",
    );
  });
  it("a same-VIN row with a different make/model is flagged, not merged", () => {
    expect(row(ID.conflict)).toBe("|");
    expect(flags(ID.conflict)).toBe("vin_conflict");
    expect(flags(ID.original)).toBe("vin_conflict");
    expect(row(ID.relist)).toBe("|");
  });
  it("rows with no VIN and single-VIN rows are left alone", () => {
    expect(row(ID.noVin)).toBe("|");
  });
  // Same bad VIN, price 10% apart (outside the fuzzy band): only a VIN key could group these.
  it("a VIN with a bad check digit is not used to group rows", () => {
    expect(row(ID.explorer)).toBe("|");
    expect(row(ID.explorer2)).toBe("|");
  });
  it("once the conflict is fixed, the earliest row is canonical and the relist points at it (1.000)", () => {
    psql(
      `UPDATE ${SCHEMA}.deals SET make='${f250.make}', model='${f250.model}' WHERE id='${ID.conflict}'`,
    );
    call([ID.conflict]);
    expect(row(ID.original)).toBe("|");
    expect(flags(ID.original)).toBe("");
    expect(row(ID.relist)).toBe(`${ID.original}|1.000`);
    expect(row(ID.conflict)).toBe(`${ID.original}|1.000`);
  });
  it("the old detect_duplicates_by_vin entry point runs the same rules", () => {
    psql(
      `SET search_path TO ${SCHEMA}, public; SELECT ${SCHEMA}.detect_duplicates_by_vin(ARRAY['${f250.vin}','${explorer.vin}']);`,
    );
    expect(row(ID.relist)).toBe(`${ID.original}|1.000`);
    expect(row(ID.explorer2)).toBe("|");
  });
  it("fuzzy: cross-host copy links to the older listing; a same-host lookalike does not", () => {
    expect(row(ID.fuzzyA)).toBe("|");
    expect(row(ID.fuzzyB)).toMatch(
      new RegExp(`^${ID.fuzzyA}\\|0\\.(850|950)$`),
    );
    expect(row(ID.sameHost)).toBe("|");
  });
  it("re-running is idempotent", () => {
    const before = [ID.relist, ID.conflict, ID.fuzzyB].map(row);
    call();
    expect([ID.relist, ID.conflict, ID.fuzzyB].map(row)).toEqual(before);
  });
  it("a deleted canonical promotes the oldest remaining copy", () => {
    psql(`DELETE FROM ${SCHEMA}.deals WHERE id='${ID.original}'`);
    call([ID.relist, ID.conflict]);
    expect(row(ID.relist)).toBe("|");
    expect(row(ID.conflict)).toBe(`${ID.relist}|1.000`);
  });
});
