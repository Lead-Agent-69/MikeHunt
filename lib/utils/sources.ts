export interface Source {
  id: string
  name: string
  url: string
  method: 'cheerio' | 'patchright' | 'camoufox' | 'api'
  notes?: string
  tier?: 'S' | 'A' | 'B' | 'C'
}

// Category 1: SALVAGE AUCTIONS (scrape every 5 min during business hours)
export const SALVAGE_SOURCES: Source[] = [
  { id: 'copart',       name: 'Copart',              url: 'https://www.copart.com',       method: 'patchright', notes: '125k+ active lots, 200 yards' },
  { id: 'iaa',          name: 'IAA / RB Global',     url: 'https://www.iaai.com',          method: 'cheerio',    notes: '200 locations, insurance totals' },
  { id: 'abetter-bid',  name: 'A Better Bid',         url: 'https://www.abetter.bid',       method: 'cheerio',    notes: 'Public Copart proxy access' },
  { id: 'autobidmaster',name: 'AutoBidMaster',        url: 'https://www.autobidmaster.com', method: 'cheerio',    notes: 'Copart + IAA international' },
  { id: 'salvagebid',   name: 'SalvageBid',          url: 'https://www.salvagebid.com',    method: 'cheerio',    notes: 'Salvage aggregator' },
  { id: 'globalaauc',   name: 'Global Auto Auctions', url: 'https://www.globalaa.com',      method: 'cheerio',    notes: 'No-license repo + salvage' },
  { id: 'bidfax',       name: 'BidFax',              url: 'https://bid.cars',              method: 'cheerio',    notes: 'Copart history + photos' },
  { id: 'e2b',          name: 'E2B Salvage',         url: 'https://www.e2bsalvage.com',    method: 'cheerio',    notes: 'Regional salvage' },
]

// Category 2: WHOLESALE DEALER AUCTIONS (scrape every 15 min)
export const WHOLESALE_SOURCES: Source[] = [
  { id: 'manheim',      name: 'Manheim Express',      url: 'https://www.manheim.com',       method: 'patchright', notes: 'Cox wholesale + MMR data' },
  { id: 'adesa',        name: 'ADESA / BacklotCars',  url: 'https://www.adesa.com',         method: 'patchright', notes: 'KAR wholesale lots' },
  { id: 'acv',          name: 'ACV Auctions',         url: 'https://www.acvauctions.com',   method: 'patchright', notes: 'D2D marketplace, 18k dealers' },
  { id: 'openlane',     name: 'OPENLANE',             url: 'https://www.openlane.com',      method: 'patchright', notes: 'KAR wholesale live' },
  { id: 'eblock',       name: 'EBlock / EDealer',     url: 'https://www.eblock.ca',         method: 'patchright', notes: 'Live synced D2D, Canada+US' },
  { id: 'smartauction', name: 'SmartAuction',         url: 'https://www.smartauctionusa.com',method:'cheerio',    notes: 'GM-Ally off-lease' },
  { id: 'ove',          name: 'OVE (Manheim online)', url: 'https://www.ove.com',           method: 'patchright', notes: 'Manheim online remarketing' },
  { id: 'traderev',     name: 'TradeRev',             url: 'https://www.traderev.com',      method: 'patchright', notes: '45-min live auctions' },
  { id: 'carwave',      name: 'CarWave',              url: 'https://www.carwave.com',       method: 'cheerio',    notes: 'Dealer-to-dealer platform' },
  { id: 'dealers-auto', name: 'Dealers Auto Auction',  url: 'https://www.daaokc.com',        method: 'cheerio',    notes: 'Regional dealer wholesale' },
  { id: 'aaa-cw',       name: 'America\'s Auto Auction',url:'https://www.aaautoauctions.com',method:'cheerio',    notes: 'Physical + online lanes' },
  { id: 'edge',         name: 'Edge Pipeline',        url: 'https://www.edgepipeline.com',  method: 'cheerio',    notes: 'AutoNation fleet runlists' },
  { id: 'carmax-w',     name: 'CarMax Wholesale',     url: 'https://www.carmax.com',        method: 'patchright', notes: 'CarMax B2B auctions' },
  { id: 'ovefacilitas', name: 'OVE Facilitas',        url: 'https://www.facilitas.com',     method: 'cheerio',    notes: 'Fleet lease returns' },
]

// Category 3: PRIVATE & RETAIL LISTINGS (scrape every 30 min)
export const PRIVATE_SOURCES: Source[] = [
  { id: 'craigslist',   name: 'Craigslist',           url: 'https://craigslist.org',        method: 'cheerio',    notes: '50 US cities, CTO section' },
  { id: 'facebook',     name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', method: 'camoufox', notes: '50 city crawlers, private+dealer' },
  { id: 'ebay',         name: 'eBay Motors',          url: 'https://www.ebay.com/motors',   method: 'cheerio',    notes: 'Auction + BIN nationwide' },
  { id: 'offerup',      name: 'OfferUp',              url: 'https://offerup.com',           method: 'patchright', notes: 'C2C local deals' },
  { id: 'carscom',      name: 'Cars.com',             url: 'https://www.cars.com',          method: 'cheerio',    notes: '25M/mo, retail+private' },
  { id: 'cargurus',     name: 'CarGurus',             url: 'https://www.cargurus.com',      method: 'cheerio',    notes: '40M/mo, deal rated' },
  { id: 'autotrader',   name: 'AutoTrader',           url: 'https://www.autotrader.com',    method: 'cheerio',    notes: 'Retail dealer deals' },
  { id: 'carsforsale',  name: 'CarsForSale.com',      url: 'https://www.carsforsale.com',   method: 'cheerio',    notes: 'Independent dealer focus' },
  { id: 'carbuyco',     name: 'CarBuyco',             url: 'https://www.carbuyco.com',      method: 'cheerio',    notes: 'Private seller marketplace' },
  { id: 'hemmings',     name: 'Hemmings',             url: 'https://www.hemmings.com',      method: 'cheerio',    notes: 'Classic + collector' },
  { id: 'bat',          name: 'Bring a Trailer',      url: 'https://bringatrailer.com',     method: 'cheerio',    notes: 'Premium collector auction' },
  { id: 'dupontregistry',name:'DuPont Registry',      url: 'https://www.dupontregistry.com',method: 'cheerio',    notes: 'Luxury + exotic' },
  { id: 'autolist',     name: 'Autolist',             url: 'https://www.autolist.com',      method: 'cheerio',    notes: 'Aggregator, real deals' },
  { id: 'carzing',      name: 'CarZing',              url: 'https://www.carzing.com',       method: 'cheerio',    notes: 'Free dealer deals' },
  { id: 'vroom',        name: 'Vroom',                url: 'https://www.vroom.com',         method: 'cheerio',    notes: 'Online dealer inventory' },
  { id: 'carvana',      name: 'Carvana',              url: 'https://www.carvana.com',       method: 'patchright', notes: 'Online retail pricing ref' },
  { id: 'shift',        name: 'Shift',                url: 'https://shift.com',             method: 'cheerio',    notes: 'Online used car retailer' },
  { id: 'truecar',      name: 'TrueCar',              url: 'https://www.truecar.com',       method: 'cheerio',    notes: 'Certified dealer pricing' },
  { id: 'motortrend',   name: 'MotorTrend Cars',      url: 'https://www.motortrend.com/cars-for-sale', method: 'cheerio', notes: 'Editorial + deals' },
  { id: 'usedcars',     name: 'UsedCars.com',         url: 'https://www.usedcars.com',      method: 'cheerio',    notes: 'Aggregated used deals' },
]

// Category 4: GOVERNMENT & REPO (scrape 6am daily)
export const REPO_GOV_SOURCES: Source[] = [
  { id: 'gsa',          name: 'GSA Auctions',         url: 'https://gsaauctions.gov',       method: 'cheerio',    notes: 'Federal surplus vehicles' },
  { id: 'publicsurplus',name: 'Public Surplus',        url: 'https://www.publicsurplus.com', method: 'cheerio',    notes: 'Municipal + gov auctions' },
  { id: 'govplanet',    name: 'GovPlanet',            url: 'https://www.govplanet.com',     method: 'cheerio',    notes: 'Heavy equipment + fleet' },
  { id: 'ironplanet',   name: 'IronPlanet',           url: 'https://www.ironplanet.com',    method: 'cheerio',    notes: 'Fleet + commercial vehicles' },
  { id: 'usaabid',      name: 'USAA Vehicle Purchase', url: 'https://www.usaa.com',         method: 'patchright', notes: 'Military member vehicles' },
  { id: 'policeauction',name: 'PoliceAuctions.com',   url: 'https://www.policeauctions.com',method: 'cheerio',    notes: 'Law enforcement seizures' },
  { id: 'propertyroom', name: 'PropertyRoom',         url: 'https://www.propertyroom.com',  method: 'cheerio',    notes: 'Police + gov surplus' },
  { id: 'seized',       name: 'Seized Cars',          url: 'https://www.seizedcars.com',    method: 'cheerio',    notes: 'DEA/police seizures' },
  { id: 'repocom',      name: 'Repo.com',             url: 'https://www.repo.com',          method: 'cheerio',    notes: 'Repossessed vehicles' },
  { id: 'ibidauto',     name: 'iBid Auto',            url: 'https://www.ibidauto.com',      method: 'cheerio',    notes: 'Repo bank network' },
]

// Category 5: INDEPENDENT DEALER SITES (scrape 2am nightly)
export const INDI_DEALER_SEEDS: string[] = [
  'https://www.ae74auto.com',
  'https://www.111autoresale.com',
  'https://www.stlautopipeline.com',
  'https://www.houstoncopartflippers.com',
  'https://www.bayareasalvageparts.com',
  // ... 842 more. Discover more via Google: site:*.com "used cars" "dealer" state:TX etc
]

// Category 6: SPECIALTY & COLLECTOR (scrape daily)
export const SPECIALTY_SOURCES: Source[] = [
  { id: 'mecum',        name: 'Mecum Auctions',       url: 'https://www.mecum.com',         method: 'cheerio' },
  { id: 'barrett',      name: 'Barrett-Jackson',      url: 'https://www.barrett-jackson.com',method: 'cheerio' },
  { id: 'rmsothebys',   name: 'RM Sotheby\'s',        url: 'https://www.rmsothebys.com',    method: 'cheerio' },
  { id: 'gooding',      name: 'Gooding & Company',    url: 'https://www.goodingco.com',     method: 'cheerio' },
  { id: 'classiccars',  name: 'ClassicCars.com',      url: 'https://classiccars.com',       method: 'cheerio' },
  { id: 'oldcarsonline',name: 'OldCarsOnline',        url: 'https://www.oldcarsonline.com', method: 'cheerio' },
  { id: 'carsandparts', name: 'Cars & Parts',         url: 'https://www.carsandparts.com',  method: 'cheerio' },
]

// Category 7: PARTS SOURCES (scrape 1am nightly)
export const PARTS_SOURCES: Source[] = [
  { id: 'car-part',     name: 'car-part.com',         url: 'https://www.car-part.com',      method: 'cheerio',    tier: 'S', notes: '200M+ OEM parts, 18k yards' },
  { id: 'lkq',          name: 'LKQ Online',           url: 'https://www.lkqonline.com',     method: 'patchright', tier: 'S', notes: 'N. America largest recycled OE' },
  { id: 'pullapart',    name: 'Pull-A-Part',          url: 'https://www.pullapart.com',     method: 'cheerio',    tier: 'S', notes: '36 superstores, 16 states' },
  { id: 'usedpart',     name: 'UsedPart.us',          url: 'https://www.usedpart.us',       method: 'cheerio',    tier: 'S', notes: '300M+ parts, 18k yards' },
  { id: 'ebay-parts',   name: 'eBay Motors Parts',    url: 'https://www.ebay.com/motors/parts', method: 'cheerio', tier: 'A' },
  { id: 'rockauto',     name: 'RockAuto',             url: 'https://www.rockauto.com',      method: 'cheerio',    tier: 'A', notes: '3,400 brands, low prices' },
  { id: 'carparts',     name: 'CarParts.com',         url: 'https://www.carparts.com',      method: 'cheerio',    tier: 'A' },
  { id: 'partshotlines',name: 'PartsHotlines',        url: 'https://www.partshotlines.com', method: 'cheerio',    tier: 'A' },
  { id: 'uneedapart',   name: 'UNeedAPart',           url: 'https://www.uneedapart.com',    method: 'cheerio',    tier: 'A' },
  { id: 'partsgeek',    name: 'PartsGeek',            url: 'https://www.partsgeek.com',     method: 'cheerio',    tier: 'B' },
  { id: 'amazon-auto',  name: 'Amazon Automotive',    url: 'https://www.amazon.com/automotive', method: 'patchright', tier: 'B' },
  { id: 'autozone',     name: 'AutoZone',             url: 'https://www.autozone.com',      method: 'cheerio',    tier: 'C', notes: 'Pricing benchmark only' },
  { id: 'oreilly',      name: "O'Reilly Auto",        url: 'https://www.oreillyauto.com',   method: 'cheerio',    tier: 'C', notes: 'Pricing benchmark' },
  { id: 'napa',         name: 'NAPA Auto',            url: 'https://www.napaonline.com',    method: 'cheerio',    tier: 'C', notes: 'Pricing benchmark' },
  { id: 'advance',      name: 'Advance Auto Parts',   url: 'https://www.advanceautoparts.com', method: 'cheerio', tier: 'C' },
  { id: 'hollander',    name: 'Hollander Parts',      url: 'https://www.hollanderparts.com',method: 'cheerio',    tier: 'B', notes: 'OEM interchange + yards' },
  { id: 'getusedparts', name: 'GetUsedParts.com',     url: 'https://www.getusedparts.com',  method: 'cheerio',    tier: 'B' },
  { id: 'fb-parts',     name: 'FB Marketplace Parts', url: 'https://www.facebook.com/marketplace', method: 'camoufox', tier: 'B', notes: 'Parts category only' },
  { id: 'oem-online',   name: 'OEMPartsonline',       url: 'https://www.oempartsonline.com',method: 'cheerio',    tier: 'B' },
  { id: 'copart-parts', name: 'Copart Lot Parts',     url: 'https://www.copart.com',        method: 'patchright', tier: 'A', notes: 'Parts from active lots' },
  { id: 'pepboys',      name: 'Pep Boys',             url: 'https://www.pepboys.com',       method: 'cheerio',    tier: 'C' },
  { id: 'fcpeuro',      name: 'FCP Euro',             url: 'https://www.fcpeuro.com',       method: 'cheerio',    tier: 'C', notes: 'European OEM specialist' },
  { id: 'carid',        name: 'CARiD',                url: 'https://www.carid.com',         method: 'cheerio',    tier: 'C' },
  { id: 'summit',       name: 'Summit Racing',        url: 'https://www.summitracing.com',  method: 'cheerio',    tier: 'C' },
  { id: 'dealer-oem',   name: 'Dealer OEM Portals',   url: 'multiple',                      method: 'patchright', tier: 'C', notes: 'Honda, Toyota, Ford, GM' },
]

export const ALL_VEHICLE_SOURCES = [
  ...SALVAGE_SOURCES,
  ...WHOLESALE_SOURCES,
  ...PRIVATE_SOURCES,
  ...REPO_GOV_SOURCES,
  ...SPECIALTY_SOURCES,
]
