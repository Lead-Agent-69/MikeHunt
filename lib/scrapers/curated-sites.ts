// The curated independent salvage / rebuilder / dealer network — a plain data module (no scraper deps) so
// API routes and the dealer-directory UI can import it cheaply. The scraper index re-exports these.

export type CuratedSiteType =
  | "salvage_yard" // total-loss / branded inventory → salvage lane (red)
  | "rebuilder_dealer" // rebuildable / repairable stock → repairable lane (orange)
  | "independent_dealer" // generic used-car lot → private lane (blue)
  | "auction_proxy" // resells auction lots → salvage/auction risk
  | "clean_retail"; // franchise / clean retail → clean-retail lane (green)

export interface CuratedSite {
  url: string;
  name: string;
  state?: string; // 2-letter; lands the site on the 50-state map + per-state discover grouping
  city?: string;
  type: CuratedSiteType;
  // Exact inventory page (absolute or path) for sites whose listings live at a non-standard URL the
  // auto-discovery can miss (e.g. St. James's /vehicles.php). When set, the crawler starts here.
  inventoryUrl?: string;
}

// type → defaults injected onto every car scraped from a site of that type. These land on
// condition / damage_type, which dealLane() already reads → correct lane/color, no dealLane change.
export const SITE_TYPE_DEFAULTS: Record<
  CuratedSiteType,
  { condition?: string; damage_type?: string; seller_type?: string }
> = {
  salvage_yard: { condition: "salvage_title", seller_type: "dealer" },
  rebuilder_dealer: {
    condition: "rebuilt_title",
    damage_type: "repairable",
    seller_type: "dealer",
  },
  independent_dealer: { condition: "run_drive", seller_type: "dealer" },
  auction_proxy: { condition: "salvage_title", seller_type: "auction" },
  clean_retail: { condition: "clean", seller_type: "dealer" },
};

// Human labels + one-line "what to expect" per type, for the directory UI.
export const SITE_TYPE_META: Record<
  CuratedSiteType,
  { label: string; blurb: string; accent: string }
> = {
  salvage_yard: {
    label: "Salvage yard",
    blurb: "Total-loss & branded titles; some also sell parts.",
    accent: "var(--red)",
  },
  rebuilder_dealer: {
    label: "Rebuilder / repairable",
    blurb: "Rebuilt & repairable stock — the flip supply.",
    accent: "var(--amber)",
  },
  independent_dealer: {
    label: "Independent dealer",
    blurb: "Mixed used-car lot; titles vary per car.",
    accent: "var(--blue)",
  },
  auction_proxy: {
    label: "Auction reseller",
    blurb: "Resells Copart/IAA lots — mostly salvage/auction risk.",
    accent: "var(--purple)",
  },
  clean_retail: {
    label: "Clean retail",
    blurb: "Franchise / clean-title retail.",
    accent: "var(--green)",
  },
};

// prettier-ignore
export const CURATED_SITES: CuratedSite[] = [
  // ── National salvage/rebuilder networks (multi-state inventory) ──
  { url: "https://www.damage.com", name: "Damage.com (74 Auto)", state: "MO", city: "Sikeston", type: "salvage_yard" }, // 722 State Hwy H, Sikeston MO 63801 per its own footer (verified 2026-10-05)
  { url: "https://www.x2builders.com", name: "X2 Builders", type: "rebuilder_dealer" },
  { url: "https://www.salvageautosauction.com", name: "Salvage Autos Auction", type: "auction_proxy" },
  { url: "https://www.repairablevehicles.com", name: "Repairable Vehicles", type: "rebuilder_dealer" },
  { url: "https://www.crashedtoys.com", name: "CrashedToys", state: "MN", type: "salvage_yard" },
  { url: "https://www.rebuildables.com", name: "Rebuildables", type: "rebuilder_dealer" },
  { url: "https://www.erepairables.com", name: "eRepairables", type: "rebuilder_dealer" },
  { url: "https://www.aeofmiami.com", name: "A&E of Miami", state: "FL", type: "independent_dealer" },
  { url: "https://www.autosavvy.com", name: "AutoSavvy", state: "UT", type: "rebuilder_dealer" }, // multi-state chain (UT/AZ/CO/ID/NV/NM/TX)
  { url: "https://www.74auto.com", name: "74Auto", type: "rebuilder_dealer" }, // salvage / repairable cars (verified)
  { url: "https://rebuilders.stjamesautoparts.com", name: "St. James Auto & Truck (Rebuilders)", type: "salvage_yard", inventoryUrl: "https://rebuilders.stjamesautoparts.com/vehicles.php" }, // parts yard that ALSO sells rebuildable vehicles — inventory at /vehicles.php
  { url: "https://www.rebuildtrucks.com", name: "RebuildTrucks", type: "rebuilder_dealer" }, // rebuildable / ready-to-drive trucks & SUVs (verified)
  { url: "https://www.globalautoauctions.com", name: "Global Auto Auctions", type: "auction_proxy" }, // IAAI reseller, damaged/rebuildable (verified)
  // ── Wave 3 — surfaced by blocking the known network in search (genuinely new, curl-verified) ──
  { url: "https://www.rebuild1.com", name: "Rebuild1", type: "rebuilder_dealer" }, // salvage cars/trucks + salvage-dealer database (verified)
  { url: "https://thepartsfarm.com", name: "The Parts Farm", type: "salvage_yard" }, // parts yard — complete cars for sale (verified)
  { url: "https://revroom.org", name: "ReVroom", type: "auction_proxy" }, // rebuilt / branded-title marketplace (verified)
  { url: "https://www.salvagetrucksauction.com", name: "Salvage Trucks Auction", type: "auction_proxy" }, // Copart reseller (verified)
  { url: "https://www.ttrepairables.com", name: "T&T Repairables", state: "IN", type: "rebuilder_dealer" }, // Spencer, IN rebuilder (browser-render; 403s curl)
  { url: "https://brickyardautoparts.com", name: "Brickyard Auto Parts", type: "salvage_yard" }, // parts yard — rebuildable inventory (verified)
  { url: "https://www.ridesafely.com", name: "RideSafely", type: "auction_proxy" }, // salvage auto auction (browser-render; 403s curl)
  { url: "https://www.repairedsalvage.com", name: "Repaired Salvage", type: "rebuilder_dealer" }, // salvage / repaired cars (verified)
  { url: "https://salvagedus.com", name: "SalvagedUS", type: "auction_proxy" }, // rebuilt / salvage marketplace, dealers + private (verified)
  { url: "https://www.bidndrive.com", name: "BidNDrive", type: "auction_proxy" }, // salvage/repairable auction (browser-render; 403s curl)
  { url: "https://www.auto4export.com", name: "Auto4Export", type: "auction_proxy" }, // salvage export auction (browser-render; 403s curl)
  // ── Wave 4 — mined from the rebuild1.com salvage-dealer directory (names → resolved domains, verified) ──
  { url: "https://www.riverbendrebuildables.com", name: "Riverbend Rebuildables & Auto Sales", state: "MO", type: "rebuilder_dealer" },
  { url: "https://www.trumannauto.com", name: "Trumann Auto Body & Sales", state: "AR", type: "rebuilder_dealer" },
  { url: "https://www.polecatsautosales.com", name: "Polecats Auto Sales", state: "MO", type: "rebuilder_dealer" },
  { url: "https://www.25autollc.com", name: "25 Auto LLC", state: "MO", type: "rebuilder_dealer" },
  { url: "https://www.cameronautollc.com", name: "Cameron Auto LLC", state: "MO", type: "rebuilder_dealer" },
  { url: "https://www.lambmotors.com", name: "Lamb Motors", type: "rebuilder_dealer" },
  { url: "https://www.glensautosales.com", name: "Glen's Auto Sales", type: "rebuilder_dealer" },
  { url: "https://www.rogersautosales.com", name: "Rogers Auto (Late Model Rebuilders)", type: "rebuilder_dealer" },
  // ── Wave 5 — mined from the Creative Design Group (4cdg.com) auto-dealer portfolio (verified) ──
  { url: "https://www.johannesauto.com", name: "Johannes Auto Sales", state: "MO", type: "rebuilder_dealer" }, // salvage/rebuilt cars + parts, Jackson MO
  { url: "https://www.autovada.com", name: "AutoVada", state: "MO", type: "independent_dealer" }, // Cape Girardeau MO lot, titles vary
  { url: "https://www.elitesikeston.com", name: "Elite Auto Sales", state: "MO", type: "independent_dealer" }, // Sikeston MO lot, titles vary
  { url: "https://www.drivenexgen.com", name: "NeXgen Motors", state: "UT", type: "rebuilder_dealer" }, // Lindon UT — rebuilt / branded-title (verified)

  // ── Northeast / Mid-Atlantic ──
  { url: "https://www.chayabrothers.com", name: "Chaya Brothers Auto & Salvage", state: "NH", type: "rebuilder_dealer" },
  { url: "https://www.argocycles.com", name: "Argo Cycles & Auto", state: "NH", type: "salvage_yard" },
  { url: "https://www.salvagezone.com", name: "SalvageZone (Elite Motor Cars)", state: "NY", type: "rebuilder_dealer" },
  { url: "https://www.alpinerebuildablecars.com", name: "Alpine Rebuildable Cars", state: "NJ", type: "rebuilder_dealer" },
  { url: "https://ezfixercars.com", name: "EZ Fixer Cars", state: "NJ", type: "rebuilder_dealer" },
  { url: "https://route34.com", name: "Route 34 Auto", state: "NJ", type: "rebuilder_dealer" },
  { url: "https://economynj.com", name: "Economy Auto", state: "NJ", type: "rebuilder_dealer" },
  { url: "https://www.replicaautosales.net", name: "Replica Auto Sales", state: "PA", type: "rebuilder_dealer" },
  { url: "https://www.alsautopa.com", name: "Al's Auto", state: "PA", type: "rebuilder_dealer" },
  { url: "https://www.novakautoparts.com", name: "Novak Auto Parts", state: "PA", type: "salvage_yard" },
  { url: "https://www.stoystownautosales.com", name: "Stoystown Auto Sales", state: "PA", type: "rebuilder_dealer" },

  // ── South / Southeast ──
  { url: "https://www.interautocenter.com", name: "Inter Auto Center", state: "VA", type: "rebuilder_dealer" },
  { url: "https://ecoastauto.com", name: "East Coast Auto Source", state: "VA", type: "rebuilder_dealer" },
  { url: "https://robbinsrepairables.com", name: "Robbins Repairables", state: "NC", type: "rebuilder_dealer" },
  { url: "https://www.newbuildcars.com", name: "Newbuild Automotive", state: "GA", type: "rebuilder_dealer" },
  { url: "https://www.autoworldofamerica.com", name: "Autoworld of America", state: "FL", type: "rebuilder_dealer" },
  { url: "https://casmiami.com", name: "CAS Miami", state: "FL", type: "auction_proxy" },
  { url: "https://sperryauto.com", name: "Sperry Auto Sales", state: "KY", type: "rebuilder_dealer", inventoryUrl: "https://www.sperryauto.com/newandusedcars" },
  { url: "https://cullmanautorebuilders.com", name: "Cullman Auto Rebuilders", state: "AL", type: "rebuilder_dealer" },
  { url: "https://www.tennisonautosales.com", name: "Tennison Auto Sales & Salvage", state: "AR", type: "rebuilder_dealer" },

  // ── Midwest ──
  { url: "https://www.marcellsinc.com", name: "Marcell's Inc", state: "OH", type: "rebuilder_dealer" },
  { url: "https://www.denisonautopartsoh.com", name: "Denison Auto Parts", state: "OH", type: "salvage_yard" },
  { url: "https://www.cardomemi.com", name: "CarDome Auto Sales", state: "MI", type: "rebuilder_dealer", inventoryUrl: "https://www.cardomemi.com/salvage-title-vehicles-for-sale-in-detroit-mi" },
  { url: "https://www.florasauto.com", name: "Flora's Auto", state: "IN", type: "rebuilder_dealer" },
  { url: "https://autonetworkinc.com", name: "Auto Network, Inc.", state: "IN", type: "rebuilder_dealer" },
  { url: "https://www.billsmithauto.com", name: "Bill Smith Auto", state: "IL", type: "rebuilder_dealer" },
  { url: "https://www.autoworksinc.com", name: "Auto Works Inc.", state: "WI", type: "rebuilder_dealer" },
  { url: "https://www.mnrepairables.com", name: "MN Motors", state: "MN", type: "rebuilder_dealer" },
  { url: "https://www.starautous.com", name: "Star Auto", state: "MN", type: "rebuilder_dealer" },
  { url: "https://midwestrepairables.com", name: "Midwest Repairables", state: "MN", type: "rebuilder_dealer" },
  { url: "https://www.royaldriveautos.com", name: "Royal Drive", state: "MN", type: "rebuilder_dealer" },
  { url: "https://www.samsriverside.com", name: "Sam's Riverside", state: "IA", type: "salvage_yard" },
  { url: "https://www.dgautollc.com", name: "D & G Auto", state: "MO", type: "rebuilder_dealer" },
  { url: "https://www.southsiderebuilders.com", name: "Southside Auto Sales", state: "MO", type: "salvage_yard" },
  { url: "https://www.prosalvage.com", name: "ProSalvage", state: "MO", type: "auction_proxy" },
  { url: "https://www.rebuildautos.com", name: "RebuildAutos", state: "MO", type: "auction_proxy" },
  { url: "https://www.recar.com", name: "ReCar", state: "MO", type: "rebuilder_dealer" },
  { url: "https://repairableautos.com", name: "Ken's Auto Body & Sales", state: "ND", type: "rebuilder_dealer" },

  // ── West / Southwest ──
  { url: "https://www.prestigeautobrokers.com", name: "Prestige Auto Brokers", state: "TX", type: "rebuilder_dealer" },
  { url: "https://www.axautostx.com", name: "America's Xtreme Auto", state: "TX", type: "rebuilder_dealer" },
  { url: "https://www.montanaautorecyclers.com", name: "Montana Auto Recyclers", state: "MT", type: "rebuilder_dealer" },
  { url: "https://asalvagecar.com", name: "STS Automotive Denver", state: "CO", type: "rebuilder_dealer" },
  { url: "https://www.prestmanauto.com", name: "Prestman Auto", state: "UT", type: "rebuilder_dealer", inventoryUrl: "https://www.prestmanauto.com/used-vehicles" },
  { url: "https://autols.com", name: "Auto LifeStyle", state: "UT", type: "rebuilder_dealer" },
  { url: "https://bestwesternmotors.com", name: "Best Western Motors", state: "AZ", type: "rebuilder_dealer" },
  { url: "https://www.autogator.com", name: "Auto Gator", state: "CA", type: "rebuilder_dealer", inventoryUrl: "https://www.autogator.com/repairable-vehicles" }, // car inventory (not /used-auto-parts)

  // ════ Wave 2 — deep gap-fill (per-metro + auction-proxy resellers) ════
  { url: "https://sca.auction", name: "SCA Auctions", type: "auction_proxy" },
  { url: "https://abetter.bid", name: "A Better Bid", type: "auction_proxy" },
  { url: "https://www.autobidmaster.com", name: "AutoBidMaster", type: "auction_proxy" },
  { url: "https://www.salvagereseller.com", name: "SalvageReseller", type: "auction_proxy" },
  { url: "https://www.salvagebid.com", name: "Salvagebid", type: "auction_proxy" },
  { url: "https://cars4.bid", name: "CARS4.BID", type: "auction_proxy" },
  { url: "https://www.bidgodrive.com", name: "BidGoDrive", type: "auction_proxy" },
  { url: "https://www.eliteautoauctions.com", name: "Elite Auto Auctions", type: "auction_proxy" },
  { url: "https://salvageagent.com", name: "SalvageAgent", type: "auction_proxy" },
  { url: "https://go2auctionsnow.com", name: "Go2AuctionsNow", type: "auction_proxy" },
  { url: "https://www.govdeals.com", name: "GovDeals", type: "auction_proxy" },
  { url: "https://municibid.com", name: "Municibid", type: "auction_proxy" },
  { url: "https://www.gsaauctions.gov", name: "GSA Auctions", type: "auction_proxy" },
  { url: "https://www.propertyroom.com", name: "PropertyRoom", type: "auction_proxy" },
  { url: "https://www.capitalautoauction.com", name: "Capital Auto Auction", type: "auction_proxy" },
  { url: "https://barnoneauction.com", name: "Bar None Auction", state: "CA", type: "auction_proxy" },

  // ── Northeast / Mid-Atlantic ──
  { url: "https://www.maxsauto.com", name: "Max's Auto Sales", state: "PA", type: "rebuilder_dealer" },

  // ── South / Southeast ──
  { url: "https://www.quickautonc.com", name: "Quick Auto Sales", state: "NC", type: "rebuilder_dealer" },
  { url: "https://www.axautosga.com", name: "AX Auto (America's Xtreme Auto)", state: "GA", type: "rebuilder_dealer" },
  { url: "https://www.wolfgangsautos.com", name: "Wolfgang's Auto Sales", state: "GA", type: "rebuilder_dealer" },
  { url: "https://www.a-autosalvage.com", name: "A-Auto Salvage", state: "AR", type: "salvage_yard", inventoryUrl: "https://www.a-autosalvage.com/used-cars-for-sale" },

  // ── Midwest / Plains ──
  { url: "https://wellerrepairables.com", name: "Weller Repairables", state: "MI", type: "rebuilder_dealer" },
  { url: "https://superiorusedautosales.com", name: "Superior Used Auto Sales", state: "MI", type: "rebuilder_dealer" },
  { url: "https://www.garysautoia.net", name: "Gary's Auto", state: "IA", type: "rebuilder_dealer", inventoryUrl: "https://www.garysautoia.net/home/used-vehicles" },
  { url: "https://www.premiersalvage.com", name: "Premier Auto Rebuilders & Truck Salvage", state: "MO", type: "salvage_yard" },
  { url: "https://midwaycarlot.com", name: "Midway Auto", state: "MO", type: "rebuilder_dealer" },
  { url: "https://americanauto.com", name: "American Auto Parts", state: "NE", type: "salvage_yard" },
  { url: "https://nordstromsrepairables.com", name: "Nordstrom's Repairables", state: "SD", type: "rebuilder_dealer" },
  { url: "https://www.kelolandautomall.com", name: "KELOLAND Automall (Repairables)", state: "SD", type: "auction_proxy" },
  { url: "https://www.seventhavenueauto.com", name: "7th Avenue Auto", state: "ND", type: "rebuilder_dealer" },

  // ── West / Mountain / Pacific ──
  { url: "https://zaraauto.net", name: "Zara Auto Sales", state: "CO", type: "rebuilder_dealer" },
  { url: "https://www.imageautosales.com", name: "Image Auto", state: "UT", type: "rebuilder_dealer", inventoryUrl: "https://www.imageautosales.com/used-cars-in-west-jordan-ut" },
  { url: "https://www.highlineauto.net", name: "High Line Auto Sales", state: "UT", type: "rebuilder_dealer", inventoryUrl: "https://www.highlineauto.net/used-cars-in-salt-lake-city-ut" },
  { url: "https://www.parklinemotors.com", name: "Parkline Motors", state: "UT", type: "rebuilder_dealer" },
  { url: "https://www.autolocitymotors.com", name: "Autolocity Motors", state: "UT", type: "rebuilder_dealer" },
  { url: "https://www.summitautoutah.com", name: "Summit Auto Sales", state: "UT", type: "rebuilder_dealer" },
  { url: "https://www.tjchapmanauto.com", name: "TJ Chapman Auto", state: "UT", type: "rebuilder_dealer" },
  { url: "https://www.familyautonv.com", name: "Family Auto LLC", state: "NV", type: "rebuilder_dealer" },
  { url: "https://www.columbia-motors.com", name: "Columbia Motors", state: "OR", type: "rebuilder_dealer", inventoryUrl: "https://www.columbia-motors.com/view-inventory" },
  { url: "https://www.sandiegototalcars.com", name: "San Diego Total Cars", state: "CA", type: "rebuilder_dealer" },

  // ════ Wave 6 — demand-ring density for IA / IL / KY / FL (Jonah 2026-10-06) ════
  // Gap anchors from /api/scrape/health demandCoverage. Each entry checked 2026-10-06: homepage +
  // inventory page return 200 without a bot challenge, robots.txt allows both for `*`, the inventory
  // page lists year/make vehicles, and no terms page found bans automated access. Sites whose terms
  // ban bots (Billion Auto, Craig & Landreth, Willis Nissan, Jeff Wyler, Robert's Auto, Rick's Auto,
  // Florida Fine Cars, Chicago Motor Cars, Paducah Ford, Kelley Autoplex) were left out on purpose.
  // ── Iowa ──
  { url: "https://iowaautoexchange.com", name: "Iowa Auto Exchange", state: "IA", city: "Des Moines", type: "independent_dealer", inventoryUrl: "https://iowaautoexchange.com/inventory/" },
  { url: "https://www.tomsautosales.com", name: "Tom's Auto Sales", state: "IA", city: "Des Moines", type: "independent_dealer" },
  { url: "https://www.tomsbudgetcars.com", name: "Tom's Budget Cars", state: "IA", city: "Des Moines", type: "independent_dealer" },
  { url: "https://www.amesford.com", name: "Ames Ford Lincoln", state: "IA", city: "Ames", type: "clean_retail", inventoryUrl: "https://www.amesford.com/used-inventory/index.htm" },
  { url: "https://www.karlchevrolet.com", name: "Karl Chevrolet", state: "IA", city: "Ankeny", type: "clean_retail", inventoryUrl: "https://www.karlchevrolet.com/used-inventory/index.htm" },
  { url: "https://www.carouselmotors.com", name: "Carousel Motors", state: "IA", city: "Iowa City", type: "clean_retail", inventoryUrl: "https://www.carouselmotors.com/all-inventory/index.htm" },
  // ── Illinois ──
  { url: "https://www.fordofpeoria.net", name: "Ford of Peoria", state: "IL", city: "Peoria", type: "clean_retail", inventoryUrl: "https://www.fordofpeoria.net/used-inventory/index.htm" },
  { url: "https://www.greentoyota.com", name: "Green Toyota", state: "IL", city: "Springfield", type: "clean_retail", inventoryUrl: "https://www.greentoyota.com/used-inventory/index.htm" },
  { url: "https://www.isringhausen.com", name: "Isringhausen Imports", state: "IL", city: "Springfield", type: "clean_retail" },
  { url: "https://www.fieldsauto.com", name: "Fields Auto", state: "IL", city: "Glenview", type: "clean_retail" },
  { url: "https://www.elgintoyota.com", name: "Elgin Toyota", state: "IL", city: "Elgin", type: "clean_retail", inventoryUrl: "https://www.elgintoyota.com/used-inventory/index.htm" },
  { url: "https://www.bredemanntoyota.com", name: "Bredemann Toyota", state: "IL", city: "Park Ridge", type: "clean_retail", inventoryUrl: "https://www.bredemanntoyota.com/used-inventory/index.htm" },
  { url: "https://www.gurneevw.com", name: "Gurnee Volkswagen", state: "IL", city: "Gurnee", type: "clean_retail", inventoryUrl: "https://www.gurneevw.com/used-inventory/index.htm" },
  { url: "https://www.auffenberg.com", name: "Auffenberg Dealer Group", state: "IL", city: "Shiloh", type: "clean_retail" },
  // ── Kentucky ──
  { url: "https://www.autohouselex.com", name: "Auto House of Lexington", state: "KY", city: "Lexington", type: "independent_dealer", inventoryUrl: "https://www.autohouselex.com/inventory" },
  { url: "https://www.glennauto.com", name: "Glenn Auto", state: "KY", city: "Crestwood", type: "independent_dealer" },
  { url: "https://www.neilhuffman.com", name: "Neil Huffman Auto Group", state: "KY", city: "Louisville", type: "clean_retail", inventoryUrl: "https://www.neilhuffman.com/used-inventory/index.htm" },
  { url: "https://www.billcollinsford.net", name: "Bill Collins Ford", state: "KY", city: "Louisville", type: "clean_retail" },
  { url: "https://www.toyotaofbowlinggreen.com", name: "Toyota of Bowling Green", state: "KY", city: "Bowling Green", type: "clean_retail", inventoryUrl: "https://www.toyotaofbowlinggreen.com/used-inventory/index.htm" },
  { url: "https://www.toyotasouth.com", name: "Toyota South", state: "KY", city: "Richmond", type: "clean_retail" },
  { url: "https://www.dancummins.com", name: "Dan Cummins", state: "KY", city: "Paris", type: "clean_retail" },
  // ── Florida ──
  { url: "https://www.fermanauto.com", name: "Ferman", state: "FL", city: "Tampa", type: "clean_retail" },
  { url: "https://brandonhonda.com", name: "Brandon Honda", state: "FL", city: "Tampa", type: "clean_retail" },
  { url: "https://www.alanjay.com", name: "Alan Jay Automotive", state: "FL", city: "Sebring", type: "clean_retail", inventoryUrl: "https://www.alanjay.com/used" },
  { url: "https://www.hollerhonda.com", name: "Holler Honda", state: "FL", city: "Orlando", type: "clean_retail" },
  { url: "https://www.toyotaoforlando.com", name: "Toyota of Orlando", state: "FL", city: "Orlando", type: "clean_retail" },
  { url: "https://www.tamiamiford.com", name: "Tamiami Ford", state: "FL", city: "Naples", type: "clean_retail" },
  { url: "https://www.jarrettforddadecity.com", name: "Jarrett Ford Dade City", state: "FL", city: "Dade City", type: "clean_retail", inventoryUrl: "https://www.jarrettforddadecity.com/used" },
  { url: "https://www.lakelandtoyota.com", name: "Lakeland Toyota", state: "FL", city: "Lakeland", type: "clean_retail" },
  { url: "https://rickcasehonda.com", name: "Rick Case Honda", state: "FL", city: "Davie", type: "clean_retail" },
  { url: "https://www.samgallowayford.com", name: "Sam Galloway Ford", state: "FL", city: "Fort Myers", type: "clean_retail" },
  { url: "https://www.sarasotaford.com", name: "Sarasota Ford", state: "FL", city: "Sarasota", type: "clean_retail" },

  // ════ Wave 7 — densify gap anchors IA/IL/KY toward ≥12 (Jonah 2026-10-06) ════
  // Curl-verified 2026-10-06: homepage (and inventoryUrl when set) return 200 with vehicle
  // inventory signals; robots.txt does not Disallow: / for *; geo confirmed from page/footer.
  // Wrong-state false friends skipped (karlchevy=CT, landmarkford=OR, zeiglerford=MI).
  // ── Iowa ──
  { url: "https://donsautotruck.com", name: "Don's Auto & Truck", state: "IA", city: "Des Moines", type: "salvage_yard", inventoryUrl: "https://donsautotruck.com/inventory" },
  { url: "https://www.sunlinecedarrapids.com", name: "Sunline Cedar Rapids", state: "IA", city: "Cedar Rapids", type: "salvage_yard" },
  { url: "https://www.autosportsimports.com", name: "Habhab's Auto Sports & Imports", state: "IA", city: "Cedar Rapids", type: "independent_dealer" },
  { url: "https://www.davewrightnissan.com", name: "Dave Wright Nissan", state: "IA", city: "Hiawatha", type: "clean_retail" },
  // ── Illinois ──
  { url: "https://www.springfieldselectautos.com", name: "Springfield Select Autos", state: "IL", city: "Springfield", type: "independent_dealer", inventoryUrl: "https://www.springfieldselectautos.com/cars-for-sale" },
  { url: "https://rhodesautosss.com", name: "Rhodes Auto S/S/S", state: "IL", city: "Streator", type: "salvage_yard" },
  { url: "https://www.continentaltoyota.com", name: "Continental Toyota", state: "IL", city: "Countryside", type: "clean_retail", inventoryUrl: "https://www.continentaltoyota.com/used-inventory/index.htm" },
  // ── Kentucky ──
  { url: "https://www.bobhook.com", name: "Bob Hook Chevrolet", state: "KY", city: "Louisville", type: "clean_retail", inventoryUrl: "https://www.bobhook.com/used-inventory/index.htm" },
  { url: "https://nkyauto.com", name: "NKY Auto", state: "KY", city: "Cold Spring", type: "rebuilder_dealer" },
  { url: "http://kyautosales.com", name: "Kentuckiana Auto Sales", state: "KY", city: "Louisville", type: "rebuilder_dealer" },
  { url: "https://www.4thstreetauto.com", name: "4th Street Auto", state: "KY", city: "Louisville", type: "independent_dealer" },
  { url: "https://www.neilhuffmanchevrolet.com", name: "Neil Huffman Chevrolet", state: "KY", city: "Frankfort", type: "clean_retail", inventoryUrl: "https://www.neilhuffmanchevrolet.com/used-inventory/index.htm" },
];

/**
 * Crawl order for one sweep: sites in planned states first, in plan order (demand / want-hit gap
 * states lead the plan), then national / untagged sites, then everything else. Stable within a
 * group. The crawl is time-boxed per job, so order decides which states actually get fresh rows.
 */
export function orderCuratedSitesForPlan<T extends Pick<CuratedSite, "state">>(
  sites: readonly T[],
  plannedStates: readonly string[] = [],
): T[] {
  if (!plannedStates.length) return [...sites];
  const rank = new Map(plannedStates.map((s, i) => [s.toUpperCase(), i]));
  const n = plannedStates.length;
  const key = (site: T) => {
    const st = String(site.state || "").toUpperCase();
    if (!st) return n; // national networks right after planned states
    return rank.get(st) ?? n + 1;
  };
  return sites
    .map((site, i) => ({ site, i, k: key(site) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.site);
}
