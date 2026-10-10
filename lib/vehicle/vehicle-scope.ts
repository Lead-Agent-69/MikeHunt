/**
 * Vehicle scope (Jonah 2026-10-09): MikeHunt lists passenger cars and trucks only (cars, pickups,
 * SUVs, vans, light and medium trucks). Heavy machinery and equipment, trailers, boats, RVs and
 * motorhomes, buses, class-8 trucks, motorcycles/powersports and municipal equipment are out.
 *
 * Gov-surplus feeds (GSA, GovDeals, PublicSurplus, AllSurplus, Municibid) mix all of these in with
 * fleet cars, so every write path runs `classifyVehicleScope` before a row is stored, and existing
 * rows that fail it are marked inactive (reversible; nothing is deleted).
 *
 * Bias: keep when unsure. A light/medium truck with a plow, crane, bucket or dump body stays in
 * (F-250 with a plow, F-550 dump, F-750 crane). Only clear non-vehicles and heavy units are dropped.
 */

export type VehicleScopeReason =
  | "equipment"
  | "trailer"
  | "boat"
  | "rv"
  | "bus"
  | "heavy_truck"
  | "powersports"
  | "non_vehicle_item"
  | "unrecognized_surplus_make";

export interface VehicleScopeInput {
  title?: string | null;
  make?: string | null;
  model?: string | null;
  body_style?: string | null;
  body_class?: string | null;
  source?: string | null;
  source_url?: string | null;
  /** Free-form vehicle type from the source (e.g. Copart memberVehicleType). */
  vehicle_type?: string | null;
}

export interface VehicleScopeResult {
  inScope: boolean;
  reason?: VehicleScopeReason;
  match?: string;
}

/** Light-vehicle makes (cars, pickups, SUVs, vans, light/medium trucks). Lowercased. */
const LIGHT_MAKES = new Set([
  "acura",
  "alfa romeo",
  "alfa",
  "aston martin",
  "audi",
  "bentley",
  "bmw",
  "buick",
  "cadillac",
  "chevrolet",
  "chevy",
  "chrysler",
  "daewoo",
  "datsun",
  "dodge",
  "eagle",
  "ferrari",
  "fiat",
  "fisker",
  "ford",
  "genesis",
  "geo",
  "gmc",
  "honda",
  "hummer",
  "hyundai",
  "infiniti",
  "isuzu",
  "jaguar",
  "jeep",
  "kia",
  "lamborghini",
  "land rover",
  "range rover",
  "lexus",
  "lincoln",
  "lotus",
  "lucid",
  "maserati",
  "maybach",
  "mazda",
  "mclaren",
  "mercedes-benz",
  "mercedes",
  "mercedes benz",
  "mercury",
  "mini",
  "mitsubishi",
  "nissan",
  "oldsmobile",
  "plymouth",
  "polestar",
  "pontiac",
  "porsche",
  "ram",
  "rivian",
  "rolls-royce",
  "rolls royce",
  "saab",
  "saturn",
  "scion",
  "smart",
  "subaru",
  "suzuki",
  "tesla",
  "toyota",
  "volkswagen",
  "vw",
  "volvo",
  "vinfast",
  "karma",
  "hino",
  "international",
  "freightliner",
  "workhorse",
  "utilimaster",
  "grumman",
  "morgan olson",
  "am general",
  "american motors",
  "amc",
  "studebaker",
  "willys",
  "packard",
  "shelby",
  "delorean",
  "checker",
  "harvester",
  "mahindra",
  "ineos",
  "mullen",
  "canoo",
  "bollinger",
  "scout",
  "kenworth",
  "peterbilt",
]);

/** Makes that only build heavy trucks, buses, RVs, boats, powersports or equipment. */
const NON_LIGHT_MAKES: Record<string, VehicleScopeReason> = {
  mack: "heavy_truck",
  "western star": "heavy_truck",
  sterling: "heavy_truck",
  autocar: "heavy_truck",
  oshkosh: "heavy_truck",
  pierce: "heavy_truck",
  "e-one": "heavy_truck",
  "emergency one": "heavy_truck",
  spartan: "heavy_truck",
  seagrave: "heavy_truck",
  sutphen: "heavy_truck",
  kme: "heavy_truck",
  ferrara: "heavy_truck",
  hme: "heavy_truck",
  "hme inc": "heavy_truck",
  "american lafrance": "heavy_truck",
  smeal: "heavy_truck",
  rosenbauer: "heavy_truck",
  horton: "heavy_truck",
  "sutphen corp": "heavy_truck",
  "crane carrier": "heavy_truck",
  marmon: "heavy_truck",
  "blue bird": "bus",
  bluebird: "bus",
  thomas: "bus",
  "thomas built": "bus",
  "ic bus": "bus",
  "champion bus": "bus",
  "eldorado national": "bus",
  "el dorado": "bus",
  "starcraft bus": "bus",
  gillig: "bus",
  "new flyer": "bus",
  collins: "bus",
  glaval: "bus",
  "turtle top": "bus",
  winnebago: "rv",
  fleetwood: "rv",
  thor: "rv",
  jayco: "rv",
  airstream: "rv",
  coachmen: "rv",
  "forest river": "rv",
  keystone: "rv",
  tiffin: "rv",
  newmar: "rv",
  "holiday rambler": "rv",
  monaco: "rv",
  "grand design": "rv",
  heartland: "rv",
  dutchmen: "rv",
  palomino: "rv",
  "harley-davidson": "powersports",
  harley: "powersports",
  "harley davidson": "powersports",
  kawasaki: "powersports",
  ducati: "powersports",
  polaris: "powersports",
  "can-am": "powersports",
  "can am": "powersports",
  "sea-doo": "boat",
  seadoo: "boat",
  "ski-doo": "powersports",
  "arctic cat": "powersports",
  ktm: "powersports",
  husqvarna: "powersports",
  "indian motorcycle": "powersports",
  "royal enfield": "powersports",
  vespa: "powersports",
  "club car": "powersports",
  bintelli: "powersports",
  "carry-all": "powersports",
  "e-z-go": "powersports",
  ezgo: "powersports",
  cushman: "powersports",
  bayliner: "boat",
  "tracker marine": "boat",
  "boston whaler": "boat",
  "sea ray": "boat",
  lund: "boat",
  mastercraft: "boat",
  bennington: "boat",
  "carolina skiff": "boat",
  caterpillar: "equipment",
  cat: "equipment",
  "john deere": "equipment",
  deere: "equipment",
  kubota: "equipment",
  bobcat: "equipment",
  komatsu: "equipment",
  "case ih": "equipment",
  "new holland": "equipment",
  jcb: "equipment",
  hitachi: "equipment",
  takeuchi: "equipment",
  vermeer: "equipment",
  "ditch witch": "equipment",
  jlg: "equipment",
  genie: "equipment",
  skyjack: "equipment",
  terex: "equipment",
  toro: "equipment",
  exmark: "equipment",
  scag: "equipment",
  hustler: "equipment",
  grasshopper: "equipment",
  "massey ferguson": "equipment",
  bandit: "equipment",
  morbark: "equipment",
  gehl: "equipment",
  hyster: "equipment",
  yale: "equipment",
  clark: "equipment",
  doosan: "equipment",
  elgin: "equipment",
  tymco: "equipment",
  schwarze: "equipment",
  vactor: "equipment",
  odb: "equipment",
  "old dominion brush": "equipment",
  "super vac": "equipment",
  supervac: "equipment",
  wacker: "equipment",
  "wacker neuson": "equipment",
  multiquip: "equipment",
  allmand: "equipment",
  wanco: "equipment",
  "solar tech": "equipment",
  "ver-mac": "equipment",
  "big tex": "trailer",
  "pj trailers": "trailer",
  "carry-on": "trailer",
  "sure-trac": "trailer",
  wabash: "trailer",
  "great dane": "trailer",
  utility: "trailer",
  fontaine: "trailer",
  felling: "trailer",
  butler: "trailer",
  interstate: "trailer",
  "load trail": "trailer",
  "big tex trailers": "trailer",
};

// Strong signals in title/model/type: the listing is not a passenger car or light/medium truck.
const PATTERNS: Array<[VehicleScopeReason, RegExp]> = [
  [
    "equipment",
    /\b(fork ?lifts?|tele ?handler|backhoes?|excavators?|mini ?ex|skid ?steers?|track ?loaders?|wheel ?loaders?|front ?end ?loaders?|bulldozers?|dozers?|motor ?graders?|road ?graders?|pavers?|compactors?|(?:drum|smooth|vibratory|asphalt) rollers?|trenchers?|(?:riding |zero[- ]turn |lawn |reel |rotary |flail |batwing |brush )?mowers?|zero[- ]turn|scissor ?lifts?|boom ?lifts?|aerial ?lifts?|man ?lifts?|wood ?chippers?|chippers?|stump ?grinders?|street ?sweepers?|sweepers?|leaf (?:collection |collector |loader |vac(?:uum)?)|vacuum (?:truck|tank)|vac[- ]?con|jetter|hydro ?excavat|asphalt (?:distributor|patcher|zipper)|concrete mixer|cement mixer|crawler|tractors?(?! trailer)|farm tractor|generators?|air compressors?|light ?towers?|message (?:board|sign)|arrow ?board|pressure washers?|welders?|snow ?blowers?|snow ?throwers?|salt (?:spreader|brine) (?:unit|system)\b|hydroseeder|forestry|pallet jack|floor scrubber)\b/i,
  ],
  [
    "trailer",
    /\b((?:utility|cargo|enclosed|flatbed|flat ?deck|dump|equipment|tilt|car hauler|boat|travel|camper|tank|fuel|water|gooseneck|lowboy|low ?boy|tag[- ]?along|pintle|horse|livestock|stock|semi|reefer|dry van|box|landscape|concession|vacuum tank|office|storage|construction|mobile|portable) trailers?|trailers?$|fifth[- ]wheel|5th[- ]wheel|pop[- ]?up camper|toy hauler|semi[- ]trailer)\b/i,
  ],
  [
    "boat",
    /\b(sea[- ]?doo|wave ?runner|bow ?rider|four winns|crownline|chaparral|mercruiser|i\/o|boats?|pontoons?|jet ?skis?|wave ?runners?|personal watercraft|pwc|outboard(?: motor)?|inboard|kayaks?|canoes?|yachts?|sailboats?|jon ?boat|bass boat|airboat|hull)\b/i,
  ],
  [
    "rv",
    /\b(motor ?homes?|motorcoach|class [abc] (?:rv|motor ?home|diesel pusher)|diesel pusher|rv|camper(?! shell| top)|travel trailer)\b/i,
  ],
  [
    "bus",
    /\b(school ?bus|shuttle ?bus|transit ?bus|passenger ?bus|para[- ]?transit|cutaway bus|mini ?bus|coach bus|tour bus|activity bus|(?<!can )bus)\b/i,
  ],
  [
    "heavy_truck",
    /\b(roll[- ]?off|rolloff|refuse|garbage truck|trash truck|rear ?loader|side ?loader|front ?loader truck|fire ?(?:truck|engine|apparatus)|(?:fire|quint|shield|rescue) pumper|pumper (?:engine|fire)|ladder truck|aerial ladder|tanker truck|semi[- ]?(?:truck|tractor)|truck tractor|day ?cab tractor|sleeper (?:cab )?tractor|tandem (?:axle )?dump|tri[- ]axle|road tractor|yard (?:truck|tractor|spotter)|terminal tractor|class 8)\b/i,
  ],
  [
    "powersports",
    /\b(motorcycles?|dirt ?bikes?|mopeds?|scooters?|atvs?|utvs?|side[- ]by[- ]side|quad|four[- ]wheeler|golf ?carts?|club car|carry[- ]?all|lsv|low[- ]speed vehicle|go[- ]?karts?|snowmobiles?|gator|mule|rzr|ranger xp|trike|minibike)\b/i,
  ],
  [
    "non_vehicle_item",
    /\b(tires? only|rims? only|wheels? only|engine only|motor only|transmission only|parts lot|lot of (?:tires|parts|wheels|rims)|camper shell|tonneau|truck bed only|bed only|plow (?:blade|only)|spreader only|cab only|chassis only|body only)\b/i,
  ],
];

// Heavy-only models from makes that also build medium trucks (keep medium).
const HEAVY_MODELS: Array<[RegExp, RegExp]> = [
  [
    /^(international|navistar)$/i,
    /\b(paystar|7[5-9]\d\d|8[0-9]\d\d|9[0-9]\d\d|lonestar|prostar|lt\d*|hx\d*|workstar|transtar|s[- ]?series 2[0-9]{3}|f[- ]?\d{4})\b/i,
  ],
  [
    /^freightliner$/i,
    /\b(cascadia|columbia|century|coronado|classic|fld\w*|flc\w*|flb\w*|fla\w*|114 ?sd|122 ?sd|108 ?sd|fl ?1[0-2]\d\w*|condor|argosy)\b/i,
  ],
  [
    /^volvo$/i,
    /\b(vnl\w*|vnm\w*|vnr\w*|vhd\w*|vah\w*|vn\d+\w*|wg\w*|wia\w*|wc\w*|wx\w*|vt ?\d+|fh\d*|fm\d+)\b/i,
  ],
  [
    /^(ford)$/i,
    /\b(ln ?[89]\d{3}|lnt ?\d*|lt ?[89]\d{3}|l ?[89]000|aeromax|louisville|hn80)\b/i,
  ],
  [/^(gmc|chevrolet)$/i, /\b(brigadier|general|c9500|t8500)\b/i],
  // Kenworth/Peterbilt: medium (class 6-7) models stay, everything else is class 8.
  [/^kenworth$/i, /^(?!.*\b(?:t[1-3][78]0|k[23]70)\b).*$/i],
  [/^peterbilt$/i, /^(?!.*\b(?:2[12]0|3[2-4][05-8]|53[5-7]|548)\b).*$/i],
  [/^hino$/i, /\b(xl[78]|700|ff)\b/i],
  [/^isuzu$/i, /\b(fx[rs]|fv[rz]|cxz|giga)\b/i],
];

// Car/truck words that rescue an ambiguous keyword hit (e.g. "Ford F-250 with plow and spreader").
const LIGHT_BODY =
  /\b(sedan|coupe|hatchback|wagon|convertible|suv|crossover|pickup|crew ?cab|ext(?:ended)? ?cab|regular cab|super ?cab|super ?crew|quad cab|double cab|minivan|cargo van|passenger van|sprinter|transit|promaster|express|savana|econoline|e-?series)\b/i;

function norm(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeKey(make: string) {
  return make.toLowerCase().replace(/\s+/g, " ").trim();
}

const GOV_SURPLUS_HOST =
  /(govdeals|gsaauctions|gsaxcess|publicsurplus|allsurplus|municibid|govplanet|ironplanet|purplewave|bidcorp|surplus)/i;

function isGovSurplus(input: VehicleScopeInput) {
  const source = String(input.source || "").toLowerCase();
  if (source === "gov_auction" || /surplus|govdeals|gsa|municibid/.test(source))
    return true;
  return GOV_SURPLUS_HOST.test(String(input.source_url || ""));
}

/**
 * Decide whether a listing is in MikeHunt's vehicle scope (passenger cars and light/medium trucks).
 * Pure and synchronous so it can run in the scraper pipeline, API routes and backfills alike.
 */
export function classifyVehicleScope(
  input: VehicleScopeInput,
): VehicleScopeResult {
  const title = norm(input.title);
  const make = norm(input.make);
  const model = norm(input.model);
  const type = norm(
    [input.vehicle_type, input.body_style, input.body_class]
      .filter(Boolean)
      .join(" "),
  );
  const mk = makeKey(make);
  const lightMake = LIGHT_MAKES.has(mk);

  // 1. Make that only builds non-light vehicles or equipment.
  const makeReason = NON_LIGHT_MAKES[mk];
  if (makeReason) {
    return { inScope: false, reason: makeReason, match: make };
  }

  // 2. Heavy-only model from a mixed make.
  for (const [makeRe, modelRe] of HEAVY_MODELS) {
    if (makeRe.test(make)) {
      const m = `${model} ${title}`.match(modelRe);
      if (m) {
        const hit = m[0].trim().slice(0, 40);
        // Freightliner/Mercedes Sprinter and other vans stay.
        if (
          /sprinter|m2 ?(?:106|112)?\b|mt[- ]?\d+|business class/i.test(
            `${model} ${title}`,
          ) &&
          !/cascadia|columbia|century|coronado/i.test(`${model} ${title}`)
        )
          break;
        return { inScope: false, reason: "heavy_truck", match: hit };
      }
    }
  }

  // 3. Keyword signals. Source vehicle type and model are authoritative; the title can carry
  //    incidental words ("tow package", "camper shell"), so a light body word rescues it.
  const authoritative = `${type} ${model}`;
  const full = `${title} ${authoritative}`;
  for (const [reason, re] of PATTERNS) {
    const strong = authoritative.match(re);
    if (strong) return { inScope: false, reason, match: strong[0] };
    const weak = title.match(re);
    if (!weak) continue;
    const rescued =
      lightMake &&
      LIGHT_BODY.test(full) &&
      // a rescued word must not be the whole subject of the listing
      !/^(?:\d{4}\s+)?(?:[a-z-]+\s+)?(?:trailer|boat|forklift|tractor|mower|bus|motorcycle)\b/i.test(
        title,
      );
    if (rescued) continue;
    // Words that are only ambiguous on a light make with a real car model ("Ford Ranger",
    // "Kawasaki Mule" vs "Ford Mule"?), keep the light make unless the word is unambiguous.
    if (
      lightMake &&
      reason === "powersports" &&
      /\b(ranger xp|gator|mule|quad|trike|scooter)\b/i.test(weak[0]) &&
      !/polaris|kawasaki|john deere|deere/i.test(full)
    )
      continue;
    if (
      lightMake &&
      reason === "bus" &&
      /^bus$/i.test(weak[0]) &&
      /volkswagen|vw/i.test(make)
    )
      continue;
    if (
      lightMake &&
      reason === "equipment" &&
      /^(generators?|welders?|light ?towers?|air compressors?)$/i.test(
        weak[0],
      ) &&
      /truck|pickup|f-?\d{3}|service body|utility body/i.test(full)
    )
      continue;
    if (
      lightMake &&
      reason === "rv" &&
      /^rv$/i.test(weak[0]) &&
      !/motor ?home|class [abc]/i.test(full)
    )
      continue;
    return { inScope: false, reason, match: weak[0] };
  }

  // 4. Gov surplus with a make we don't recognise as a car/truck brand ("ODB", "SUPER VAC").
  if (make && !lightMake && isGovSurplus(input) && !LIGHT_BODY.test(full)) {
    return { inScope: false, reason: "unrecognized_surplus_make", match: make };
  }

  return { inScope: true };
}

export function isInVehicleScope(input: VehicleScopeInput): boolean {
  return classifyVehicleScope(input).inScope;
}

/** Split rows into kept and dropped, with per-reason counts for logs. */
export function partitionVehicleScope<T extends VehicleScopeInput>(rows: T[]) {
  const kept: T[] = [];
  const dropped: Array<{ row: T; reason: VehicleScopeReason; match?: string }> =
    [];
  const byReason: Partial<Record<VehicleScopeReason, number>> = {};
  for (const row of rows) {
    const r = classifyVehicleScope(row);
    if (r.inScope) kept.push(row);
    else {
      dropped.push({ row, reason: r.reason!, match: r.match });
      byReason[r.reason!] = (byReason[r.reason!] || 0) + 1;
    }
  }
  return { kept, dropped, byReason };
}
