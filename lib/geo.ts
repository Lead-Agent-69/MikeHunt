// lib/geo.ts
// Shared US geography helpers for nationwide (50-state) scraping + distance/transport math.

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

export type StateCode = (typeof US_STATES)[number];

// Rough center coordinates for all 50 states (for straight-line distance estimates).
export const STATE_COORDS: Record<string, { lat: number; lon: number }> = {
  AL: { lat: 32.806671, lon: -86.79113 },
  AK: { lat: 61.370716, lon: -152.404419 },
  AZ: { lat: 33.729759, lon: -111.431221 },
  AR: { lat: 34.969704, lon: -92.373123 },
  CA: { lat: 36.116203, lon: -119.681564 },
  CO: { lat: 39.059811, lon: -105.311104 },
  CT: { lat: 41.597782, lon: -72.755371 },
  DE: { lat: 39.318523, lon: -75.507141 },
  FL: { lat: 27.766279, lon: -81.686783 },
  GA: { lat: 33.040619, lon: -83.643074 },
  HI: { lat: 21.094318, lon: -157.498337 },
  ID: { lat: 44.240459, lon: -114.478828 },
  IL: { lat: 40.349457, lon: -88.986137 },
  IN: { lat: 39.849426, lon: -86.258278 },
  IA: { lat: 42.011539, lon: -93.210526 },
  KS: { lat: 38.5266, lon: -96.726486 },
  KY: { lat: 37.66814, lon: -84.670067 },
  LA: { lat: 31.169546, lon: -91.867805 },
  ME: { lat: 44.693947, lon: -69.381927 },
  MD: { lat: 39.063946, lon: -76.802101 },
  MA: { lat: 42.230171, lon: -71.530106 },
  MI: { lat: 43.326618, lon: -84.536095 },
  MN: { lat: 45.694454, lon: -93.900192 },
  MS: { lat: 32.741646, lon: -89.678696 },
  MO: { lat: 38.456085, lon: -92.288368 },
  MT: { lat: 46.921925, lon: -110.454353 },
  NE: { lat: 41.12537, lon: -98.268082 },
  NV: { lat: 38.313515, lon: -117.055374 },
  NH: { lat: 43.452492, lon: -71.563896 },
  NJ: { lat: 40.298904, lon: -74.521011 },
  NM: { lat: 34.840515, lon: -106.248482 },
  NY: { lat: 42.165726, lon: -74.948051 },
  NC: { lat: 35.630066, lon: -79.806419 },
  ND: { lat: 47.528912, lon: -99.784012 },
  OH: { lat: 40.388783, lon: -82.764915 },
  OK: { lat: 35.565342, lon: -96.928917 },
  OR: { lat: 44.572021, lon: -122.070938 },
  PA: { lat: 40.590752, lon: -77.209755 },
  RI: { lat: 41.680893, lon: -71.51178 },
  SC: { lat: 33.856892, lon: -80.945007 },
  SD: { lat: 44.299782, lon: -99.438828 },
  TN: { lat: 35.747845, lon: -86.692345 },
  TX: { lat: 31.054487, lon: -97.563461 },
  UT: { lat: 40.150032, lon: -111.862434 },
  VT: { lat: 44.045876, lon: -72.710686 },
  VA: { lat: 37.769337, lon: -78.169968 },
  WA: { lat: 47.382679, lon: -121.512054 },
  WV: { lat: 38.491226, lon: -80.954453 },
  WI: { lat: 44.268543, lon: -89.616508 },
  WY: { lat: 42.755966, lon: -107.30249 },
};

// One representative metro ZIP per state — seed for radius-based searches (cars.com, autotrader…).
export const STATE_SEED_ZIPS: Record<string, string> = {
  AL: "35203",
  AK: "99501",
  AZ: "85004",
  AR: "72201",
  CA: "90012",
  CO: "80202",
  CT: "06103",
  DE: "19801",
  FL: "33131",
  GA: "30303",
  HI: "96813",
  ID: "83702",
  IL: "60601",
  IN: "46204",
  IA: "50309",
  KS: "67202",
  KY: "40202",
  LA: "70112",
  ME: "04101",
  MD: "21201",
  MA: "02108",
  MI: "48226",
  MN: "55401",
  MS: "39201",
  MO: "63101",
  MT: "59601",
  NE: "68102",
  NV: "89101",
  NH: "03101",
  NJ: "07102",
  NM: "87102",
  NY: "10007",
  NC: "28202",
  ND: "58102",
  OH: "43215",
  OK: "73102",
  OR: "97204",
  PA: "19107",
  RI: "02903",
  SC: "29201",
  SD: "57104",
  TN: "37203",
  TX: "75201",
  UT: "84111",
  VT: "05401",
  VA: "23219",
  WA: "98104",
  WV: "25301",
  WI: "53202",
  WY: "82001",
};

// Craigslist city subdomains mapped to state. Covers all 50 states; big states have several
// metros. Override the active set via the CL_CITIES env (comma-separated subdomains).
export const CRAIGSLIST_SITES: { site: string; state: string }[] = [
  // AL
  { site: "bham", state: "AL" },
  { site: "mobile", state: "AL" },
  { site: "montgomery", state: "AL" },
  { site: "huntsville", state: "AL" },
  // AK
  { site: "anchorage", state: "AK" },
  // AZ
  { site: "phoenix", state: "AZ" },
  { site: "tucson", state: "AZ" },
  { site: "flagstaff", state: "AZ" },
  // AR
  { site: "littlerock", state: "AR" },
  { site: "fayar", state: "AR" },
  // CA
  { site: "losangeles", state: "CA" },
  { site: "sandiego", state: "CA" },
  { site: "sfbay", state: "CA" },
  { site: "sacramento", state: "CA" },
  { site: "fresno", state: "CA" },
  { site: "orangecounty", state: "CA" },
  { site: "inlandempire", state: "CA" },
  { site: "bakersfield", state: "CA" },
  { site: "stockton", state: "CA" },
  // CO
  { site: "denver", state: "CO" },
  { site: "cosprings", state: "CO" },
  { site: "fortcollins", state: "CO" },
  // CT
  { site: "hartford", state: "CT" },
  { site: "newhaven", state: "CT" },
  // DE
  { site: "delaware", state: "DE" },
  // FL
  { site: "miami", state: "FL" },
  { site: "orlando", state: "FL" },
  { site: "tampa", state: "FL" },
  { site: "jacksonville", state: "FL" },
  { site: "fortmyers", state: "FL" },
  { site: "westpalmbeach", state: "FL" },
  // GA
  { site: "atlanta", state: "GA" },
  { site: "savannah", state: "GA" },
  { site: "augusta", state: "GA" },
  // HI
  { site: "honolulu", state: "HI" },
  // ID
  { site: "boise", state: "ID" },
  // IL
  { site: "chicago", state: "IL" },
  { site: "peoria", state: "IL" },
  { site: "springfieldil", state: "IL" },
  // IN
  { site: "indianapolis", state: "IN" },
  { site: "fortwayne", state: "IN" },
  { site: "evansville", state: "IN" },
  // IA
  { site: "desmoines", state: "IA" },
  { site: "cedarrapids", state: "IA" },
  // KS
  { site: "wichita", state: "KS" },
  { site: "topeka", state: "KS" },
  { site: "ksu", state: "KS" },
  // KY
  { site: "louisville", state: "KY" },
  { site: "lexington", state: "KY" },
  // LA
  { site: "neworleans", state: "LA" },
  { site: "batonrouge", state: "LA" },
  { site: "shreveport", state: "LA" },
  // ME
  { site: "maine", state: "ME" },
  // MD
  { site: "baltimore", state: "MD" },
  { site: "annapolis", state: "MD" },
  // MA
  { site: "boston", state: "MA" },
  { site: "westernmass", state: "MA" },
  { site: "capecod", state: "MA" },
  // MI
  { site: "detroit", state: "MI" },
  { site: "grandrapids", state: "MI" },
  { site: "annarbor", state: "MI" },
  { site: "lansing", state: "MI" },
  // MN
  { site: "minneapolis", state: "MN" },
  { site: "duluth", state: "MN" },
  // MS
  { site: "jackson", state: "MS" },
  { site: "gulfport", state: "MS" },
  // MO
  { site: "stlouis", state: "MO" },
  { site: "kansascity", state: "MO" },
  { site: "springfield", state: "MO" },
  // MT
  { site: "billings", state: "MT" },
  { site: "missoula", state: "MT" },
  // NE
  { site: "omaha", state: "NE" },
  { site: "lincoln", state: "NE" },
  // NV
  { site: "lasvegas", state: "NV" },
  { site: "reno", state: "NV" },
  // NH
  { site: "nh", state: "NH" },
  // NJ
  { site: "newjersey", state: "NJ" },
  { site: "cnj", state: "NJ" },
  { site: "southjersey", state: "NJ" },
  // NM
  { site: "albuquerque", state: "NM" },
  { site: "santafe", state: "NM" },
  // NY
  { site: "newyork", state: "NY" },
  { site: "longisland", state: "NY" },
  { site: "albany", state: "NY" },
  { site: "buffalo", state: "NY" },
  { site: "rochester", state: "NY" },
  { site: "syracuse", state: "NY" },
  // NC
  { site: "charlotte", state: "NC" },
  { site: "raleigh", state: "NC" },
  { site: "greensboro", state: "NC" },
  { site: "asheville", state: "NC" },
  // ND
  { site: "fargo", state: "ND" },
  { site: "bismarck", state: "ND" },
  // OH
  { site: "columbus", state: "OH" },
  { site: "cleveland", state: "OH" },
  { site: "cincinnati", state: "OH" },
  { site: "dayton", state: "OH" },
  { site: "toledo", state: "OH" },
  // OK
  { site: "oklahomacity", state: "OK" },
  { site: "tulsa", state: "OK" },
  // OR
  { site: "portland", state: "OR" },
  { site: "eugene", state: "OR" },
  { site: "bend", state: "OR" },
  // PA
  { site: "philadelphia", state: "PA" },
  { site: "pittsburgh", state: "PA" },
  { site: "harrisburg", state: "PA" },
  { site: "allentown", state: "PA" },
  // RI
  { site: "providence", state: "RI" },
  // SC
  { site: "columbia", state: "SC" },
  { site: "charleston", state: "SC" },
  { site: "greenville", state: "SC" },
  // SD
  { site: "sd", state: "SD" },
  { site: "rapidcity", state: "SD" },
  // TN
  { site: "nashville", state: "TN" },
  { site: "memphis", state: "TN" },
  { site: "knoxville", state: "TN" },
  { site: "chattanooga", state: "TN" },
  // TX
  { site: "dallas", state: "TX" },
  { site: "houston", state: "TX" },
  { site: "austin", state: "TX" },
  { site: "sanantonio", state: "TX" },
  { site: "elpaso", state: "TX" },
  { site: "fortworth", state: "TX" },
  { site: "rgv", state: "TX" },
  // UT
  { site: "saltlakecity", state: "UT" },
  { site: "provo", state: "UT" },
  // VT
  { site: "vermont", state: "VT" },
  // VA
  { site: "richmond", state: "VA" },
  { site: "norfolk", state: "VA" },
  { site: "nova", state: "VA" },
  { site: "roanoke", state: "VA" },
  // WA
  { site: "seattle", state: "WA" },
  { site: "spokane", state: "WA" },
  { site: "tacoma", state: "WA" },
  // WV
  { site: "wv", state: "WV" },
  { site: "charlestonwv", state: "WV" },
  // WI
  { site: "milwaukee", state: "WI" },
  { site: "madison", state: "WI" },
  { site: "greenbay", state: "WI" },
  // WY
  { site: "wyoming", state: "WY" },
];

/** Straight-line miles between two lat/lon points × 1.3 driving overhead. */
export function getDrivingMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.3);
}

/** Estimated driving miles between two state centers. Same state ≈ 45 (local tow). */
export function milesBetweenStates(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const a = STATE_COORDS[from.toUpperCase()];
  const b = STATE_COORDS[to.toUpperCase()];
  if (!a || !b) return null;
  if (from.toUpperCase() === to.toUpperCase()) return 45;
  return getDrivingMiles(a.lat, a.lon, b.lat, b.lon);
}

/** Carrier transport cost for a distance: $0.78/mi + $50 hookup, $150 minimum. */
export function transportCostForMiles(miles: number): number {
  return Math.max(150, Math.round(miles * 0.78) + 50);
}
