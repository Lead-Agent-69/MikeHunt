import { EnhancedScraperConfig } from './enhanced-engine'

// Comprehensive source configurations for DealerHunt
export const SCRAPER_CONFIGS: EnhancedScraperConfig[] = [
  // Major Auction Platforms
  {
    name: 'copart',
    baseUrl: 'https://www.copart.com',
    type: 'auction',
    updateFrequency: 15, // 15 minutes
    requiresAuth: true,
    proxyRotation: true,
    stealthMode: true,
    selectors: {
      dealContainer: 'div.lot-item',
      title: 'span.lot-title',
      price: 'span.lot-price',
      year: 'span.lot-year',
      make: 'span.lot-make',
      model: 'span.lot-model',
      vin: 'span.lot-vin',
      mileage: 'span.lot-mileage',
      location: 'span.lot-location',
      images: 'img.lot-image',
      auctionEnd: 'span.lot-end-time',
      bidCount: 'span.lot-bid-count',
      seller: 'span.lot-seller'
    },
    pagination: {
      nextSelector: 'a.pagination-next',
      maxPages: 10
    },
    rateLimit: {
      requests: 2,
      perMs: 60000 // 2 requests per minute
    }
  },
  {
    name: 'iaa',
    baseUrl: 'https://www.iaai.com',
    type: 'auction',
    updateFrequency: 15,
    requiresAuth: true,
    proxyRotation: true,
    stealthMode: true,
    selectors: {
      dealContainer: 'div.vehicle-item',
      title: 'h3.vehicle-title',
      price: 'span.bid-current',
      year: 'span.vehicle-year',
      make: 'span.vehicle-make',
      model: 'span.vehicle-model',
      vin: 'span.vehicle-vin',
      mileage: 'span.vehicle-mileage',
      location: 'span.vehicle-location',
      images: 'img.vehicle-image',
      auctionEnd: 'span.auction-end',
      bidCount: 'span.bid-count',
      seller: 'span.seller-name'
    },
    pagination: {
      nextSelector: 'a.next-page',
      maxPages: 10
    },
    rateLimit: {
      requests: 2,
      perMs: 60000
    }
  },
  {
    name: 'adesa',
    baseUrl: 'https://www.adesa.com',
    type: 'auction',
    updateFrequency: 30,
    requiresAuth: true,
    proxyRotation: true,
    stealthMode: true,
    selectors: {
      dealContainer: 'div.auction-item',
      title: 'h4.lot-title',
      price: 'span.current-bid',
      year: 'span.lot-year',
      make: 'span.lot-make',
      model: 'span.lot-model',
      vin: 'span.lot-vin',
      mileage: 'span.lot-mileage',
      location: 'span.lot-location',
      images: 'img.lot-image',
      auctionEnd: 'span.time-left',
      bidCount: 'span.bid-count',
      seller: 'span.seller-info'
    },
    pagination: {
      nextSelector: 'a.pagination-next',
      maxPages: 8
    },
    rateLimit: {
      requests: 1,
      perMs: 60000
    }
  },
  {
    name: 'manheim',
    baseUrl: 'https://www.manheim.com',
    type: 'auction',
    updateFrequency: 30,
    requiresAuth: true,
    proxyRotation: true,
    stealthMode: true,
    selectors: {
      dealContainer: 'div.vehicle-card',
      title: 'h3.vehicle-title',
      price: 'span.bid-amount',
      year: 'span.vehicle-year',
      make: 'span.vehicle-make',
      model: 'span.vehicle-model',
      vin: 'span.vehicle-vin',
      mileage: 'span.vehicle-mileage',
      location: 'span.vehicle-location',
      images: 'img.vehicle-photo',
      auctionEnd: 'span.auction-time',
      bidCount: 'span.bid-total',
      seller: 'span.seller-name'
    },
    pagination: {
      nextSelector: 'a.next-page',
      maxPages: 8
    },
    rateLimit: {
      requests: 1,
      perMs: 60000
    }
  },

  // Digital Auction Platforms
  {
    name: 'acv-auctions',
    baseUrl: 'https://www.acvauctions.com',
    type: 'auction',
    updateFrequency: 20,
    requiresAuth: true,
    proxyRotation: true,
    stealthMode: true,
    selectors: {
      dealContainer: 'div.deal-item',
      title: 'h2.vehicle-title',
      price: 'span.current-price',
      year: 'span.vehicle-year',
      make: 'span.vehicle-make',
      model: 'span.vehicle-model',
      vin: 'span.vehicle-vin',
      mileage: 'span.vehicle-mileage',
      location: 'span.vehicle-location',
      images: 'img.vehicle-image',
      auctionEnd: 'span.time-remaining',
      bidCount: 'span.bid-count',
      seller: 'span.seller-name'
    },
    pagination: {
      nextSelector: 'button.load-more',
      maxPages: 12
    },
    rateLimit: {
      requests: 3,
      perMs: 60000
    }
  },

  // Marketplace Platforms
  {
    name: 'facebook-marketplace',
    baseUrl: 'https://www.facebook.com/marketplace',
    type: 'marketplace',
    updateFrequency: 45,
    requiresAuth: false,
    proxyRotation: true,
    stealthMode: true,
    selectors: {
      dealContainer: 'div[data-testid="marketplace-search-item"]',
      title: 'span[data-testid="marketplace-search-item-title"]',
      price: 'span[data-testid="marketplace-search-item-price"]',
      location: 'span[data-testid="marketplace-search-item-location"]',
      images: 'img[data-testid="marketplace-search-item-image"]',
      description: 'div[data-testid="marketplace-search-item-description"]'
    },
    pagination: {
      nextSelector: 'div[role="button"]:has-text("See more")',
      maxPages: 20
    },
    rateLimit: {
      requests: 5,
      perMs: 60000
    }
  },
  {
    name: 'craigslist',
    baseUrl: 'https://www.craigslist.org',
    type: 'marketplace',
    updateFrequency: 60,
    requiresAuth: false,
    proxyRotation: true,
    stealthMode: false,
    selectors: {
      dealContainer: 'li.result-row',
      title: 'a.result-title',
      price: 'span.result-price',
      location: 'span.result-hood',
      description: 'p.result-info'
    },
    pagination: {
      nextSelector: 'a.button.next',
      maxPages: 25
    },
    rateLimit: {
      requests: 10,
      perMs: 60000
    }
  },
  {
    name: 'ebay-motors',
    baseUrl: 'https://www.ebay.com/motors',
    type: 'marketplace',
    updateFrequency: 30,
    requiresAuth: false,
    proxyRotation: true,
    stealthMode: false,
    selectors: {
      dealContainer: 'div.s-item',
      title: 'h3.s-item__title',
      price: 'span.s-item__price',
      mileage: 'div.s-item__subtitle',
      location: 'span.s-item__location',
      images: 'img.s-item__image-img',
      auctionEnd: 'span.s-item__time-left',
      bidCount: 'span.s-item__bids'
    },
    pagination: {
      nextSelector: 'a.pagination__next',
      maxPages: 15
    },
    rateLimit: {
      requests: 4,
      perMs: 60000
    }
  },

  // Parts Marketplaces
  {
    name: 'carparts-com',
    baseUrl: 'https://www.carparts.com',
    type: 'parts',
    updateFrequency: 60,
    requiresAuth: false,
    proxyRotation: true,
    stealthMode: false,
    selectors: {
      dealContainer: 'div.part-item',
      title: 'h4.part-title',
      price: 'span.part-price',
      location: 'span.part-location',
      images: 'img.part-image',
      description: 'div.part-description'
    },
    pagination: {
      nextSelector: 'a.pagination-next',
      maxPages: 20
    },
    rateLimit: {
      requests: 6,
      perMs: 60000
    }
  },

  // Independent Dealer Sites - Sample configurations
  // These would be dynamically generated based on discovered dealer sites
  {
    name: 'ae-miami-74-auto',
    baseUrl: 'https://www.aemiami74auto.com',
    type: 'dealer',
    updateFrequency: 240, // 4 hours
    requiresAuth: false,
    proxyRotation: false,
    stealthMode: false,
    selectors: {
      dealContainer: 'div.vehicle-item',
      title: 'h3.vehicle-title',
      price: 'span.vehicle-price',
      year: 'span.vehicle-year',
      make: 'span.vehicle-make',
      model: 'span.vehicle-model',
      mileage: 'span.vehicle-mileage',
      location: 'span.dealer-location',
      images: 'img.vehicle-photo',
      description: 'div.vehicle-description',
      seller: 'span.dealer-name'
    },
    pagination: {
      nextSelector: 'a.next-page',
      maxPages: 5
    },
    rateLimit: {
      requests: 2,
      perMs: 60000
    }
  },
  {
    name: '111-auto-resale',
    baseUrl: 'https://www.111autoresale.com',
    type: 'dealer',
    updateFrequency: 240,
    requiresAuth: false,
    proxyRotation: false,
    stealthMode: false,
    selectors: {
      dealContainer: 'div.inventory-item',
      title: 'h2.car-title',
      price: 'span.car-price',
      year: 'span.car-year',
      make: 'span.car-make',
      model: 'span.car-model',
      mileage: 'span.car-mileage',
      location: 'span.dealer-location',
      images: 'img.car-photo',
      description: 'div.car-description',
      seller: 'span.dealer-name'
    },
    pagination: {
      nextSelector: 'a.pagination-next',
      maxPages: 5
    },
    rateLimit: {
      requests: 2,
      perMs: 60000
    }
  },
  {
    name: 'stl-auction-pipeline',
    baseUrl: 'https://www.stlauctionpipeline.com',
    type: 'dealer',
    updateFrequency: 240,
    requiresAuth: false,
    proxyRotation: false,
    stealthMode: false,
    selectors: {
      dealContainer: 'div.wholesale-item',
      title: 'h3.unit-title',
      price: 'span.unit-price',
      year: 'span.unit-year',
      make: 'span.unit-make',
      model: 'span.unit-model',
      mileage: 'span.unit-mileage',
      location: 'span.dealer-location',
      images: 'img.unit-photo',
      description: 'div.unit-notes',
      seller: 'span.dealer-name'
    },
    pagination: {
      nextSelector: 'a.next-page',
      maxPages: 5
    },
    rateLimit: {
      requests: 2,
      perMs: 60000
    }
  }
]

// Geographic regions for targeted scraping
export const GEOGRAPHIC_REGIONS = {
  southeast: ['FL', 'GA', 'AL', 'MS', 'SC', 'NC', 'TN'],
  midwest: ['MO', 'IL', 'IN', 'OH', 'MI', 'WI', 'MN', 'IA', 'KS', 'NE', 'SD', 'ND'],
  northeast: ['NY', 'PA', 'NJ', 'MA', 'CT', 'RI', 'VT', 'NH', 'ME', 'DE', 'MD', 'WV', 'DC'],
  southwest: ['TX', 'OK', 'AR', 'LA', 'NM', 'AZ'],
  west: ['CA', 'OR', 'WA', 'NV', 'UT', 'CO', 'WY', 'MT', 'ID'],
  pacific: ['AK', 'HI']
}

// Major metropolitan areas for focused scraping
export const METRO_AREAS = [
  { name: 'Miami-Fort Lauderdale', states: ['FL'], cities: ['miami', 'fort-lauderdale', 'hialeah', 'pompano-beach'] },
  { name: 'Houston', states: ['TX'], cities: ['houston', 'galveston', 'baytown', 'conroe'] },
  { name: 'Dallas-Fort Worth', states: ['TX'], cities: ['dallas', 'fort-worth', 'arlington', 'plano'] },
  { name: 'Los Angeles', states: ['CA'], cities: ['los-angeles', 'long-beach', 'anaheim', 'santa-ana'] },
  { name: 'Chicago', states: ['IL'], cities: ['chicago', 'naperville', 'joliet', 'aurora'] },
  { name: 'Atlanta', states: ['GA'], cities: ['atlanta', 'augusta', 'columbus', 'savannah'] },
  { name: 'Phoenix', states: ['AZ'], cities: ['phoenix', 'scottsdale', 'mesa', 'chandler'] },
  { name: 'Philadelphia', states: ['PA'], cities: ['philadelphia', 'pittsburgh', 'allentown', 'erie'] },
  { name: 'Detroit', states: ['MI'], cities: ['detroit', 'grand-rapids', 'warren', 'sterling-heights'] },
  { name: 'St. Louis', states: ['MO'], cities: ['st-louis', 'kansas-city', 'springfield', 'columbia'] }
]

// Vehicle categories for targeted scraping
export const VEHICLE_CATEGORIES = {
  cars: ['sedan', 'coupe', 'convertible', 'hatchback'],
  trucks: ['pickup', 'truck', 'utility'],
  suvs: ['suv', 'crossover', 'sport-utility'],
  vans: ['van', 'minivan', 'cargo-van'],
  commercial: ['commercial', 'fleet', 'work-truck'],
  luxury: ['luxury', 'premium', 'exotic'],
  economy: ['economy', 'compact', 'subcompact'],
  electric: ['electric', 'ev', 'hybrid', 'plugin-hybrid']
}

// Price ranges for filtering
export const PRICE_RANGES = {
  budget: { min: 0, max: 5000 },
  economy: { min: 5000, max: 15000 },
  midrange: { min: 15000, max: 30000 },
  premium: { min: 30000, max: 50000 },
  luxury: { min: 50000, max: 100000 },
  exotic: { min: 100000, max: 999999 }
}

// Age ranges for filtering
export const AGE_RANGES = {
  current: { min: 0, max: 2 }, // 0-2 years old
  recent: { min: 3, max: 5 }, // 3-5 years old
  modern: { min: 6, max: 10 }, // 6-10 years old
  mature: { min: 11, max: 15 }, // 11-15 years old
  classic: { min: 16, max: 30 }, // 16-30 years old
  vintage: { min: 31, max: 999 } // 31+ years old
}
