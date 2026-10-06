import { STATE_SEED_ZIPS } from "@/lib/geo";

/**
 * Metro ZIPs per state for radius searches (cars.com, AutoTrader, AutoTempest).
 *
 * One seed ZIP with a 100mi radius only covers one metro. Texas, California, Florida and the big
 * rural states have most of their inventory outside it. The first ZIP is always the original
 * STATE_SEED_ZIPS entry. The rest are spread out so 100mi circles overlap as little as possible.
 * These are search centers only. A row's state still comes from the listing (#31).
 */
export const STATE_METRO_ZIPS: Record<string, readonly string[]> = {
  AL: ["35203", "36602", "35801", "36104"],
  AK: ["99501", "99701"],
  AZ: ["85004", "85701", "86001"],
  AR: ["72201", "72701"],
  CA: ["90012", "94103", "92101", "95814", "93721", "96001"],
  CO: ["80202", "81501", "81003"],
  CT: ["06103"],
  DC: ["20001"],
  DE: ["19801"],
  FL: ["33131", "32801", "33602", "32202", "32301", "32501"],
  GA: ["30303", "31401", "31701"],
  HI: ["96813"],
  ID: ["83702", "83402", "83814"],
  IL: ["60601", "62701", "62901"],
  IN: ["46204", "46802", "47708"],
  IA: ["50309", "52401", "51101"],
  KS: ["67202", "66101", "67601"],
  KY: ["40202", "42101", "41501"],
  LA: ["70112", "71101", "70501"],
  ME: ["04101", "04401"],
  MD: ["21201", "21801", "21502"],
  MA: ["02108", "01103"],
  MI: ["48226", "49503", "49684", "49855"],
  MN: ["55401", "55802", "56601"],
  MS: ["39201", "38801", "39501"],
  MO: ["63101", "64106", "65806"],
  MT: ["59601", "59101", "59801"],
  NE: ["68102", "68801", "69101"],
  NV: ["89101", "89501"],
  NH: ["03101"],
  NJ: ["07102", "08401"],
  NM: ["87102", "88001", "88201"],
  NY: ["10007", "12207", "13202", "14202"],
  NC: ["28202", "27601", "28801", "28401"],
  ND: ["58102", "58501", "58701"],
  OH: ["43215", "44113", "45202", "43604"],
  OK: ["73102", "74103", "73501"],
  OR: ["97204", "97401", "97701", "97501"],
  PA: ["19107", "15222", "17101", "16501", "18503"],
  RI: ["02903"],
  SC: ["29201", "29401", "29601"],
  SD: ["57104", "57701", "57401"],
  TN: ["37203", "38103", "37902", "37402"],
  TX: [
    "75201",
    "77002",
    "78205",
    "78701",
    "79901",
    "79401",
    "78401",
    "79101",
    "78501",
    "79701",
  ],
  UT: ["84111", "84770"],
  VT: ["05401"],
  VA: ["23219", "23510", "22201", "24011", "24201"],
  WA: ["98104", "99201", "98901"],
  WV: ["25301", "26501"],
  WI: ["53202", "54301", "54701"],
  WY: ["82001", "82601", "82901"],
};

/** Every state the sweep can plan: 50 states plus DC. */
export const SWEEP_STATE_CODES: readonly string[] =
  Object.keys(STATE_METRO_ZIPS);

/**
 * `count` metro ZIPs for a state, starting at `offset` and wrapping. Rotating the offset across
 * sweeps walks every metro in a state instead of re-searching the same city.
 */
export function metroZipsForState(
  state: string,
  count = 2,
  offset = 0,
): string[] {
  const code = String(state || "")
    .trim()
    .toUpperCase();
  const zips =
    STATE_METRO_ZIPS[code] ||
    (STATE_SEED_ZIPS[code] ? [STATE_SEED_ZIPS[code]] : []);
  if (!zips.length) return [];
  const n = Math.max(1, Math.min(zips.length, Math.floor(count) || 1));
  const start =
    ((Math.floor(offset) % zips.length) + zips.length) % zips.length;
  return Array.from({ length: n }, (_, i) => zips[(start + i) % zips.length]);
}
