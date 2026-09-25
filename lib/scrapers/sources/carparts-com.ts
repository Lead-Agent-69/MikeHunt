// lib/scrapers/sources/carparts-com.ts
// ─── CarParts.com parts marketplace scraper ───────────────────────────────────

import type { Deal } from '@/types'
import * as cheerio from 'cheerio'
import { paginate, extractPrice, normalizeUrl, type ScraperConfig } from '../engine'
import { upsertDeals } from '../pipeline'

export const CARPARTS_COM_CONFIG: ScraperConfig = {
  name: 'CarParts.com',
  baseUrl: 'https://www.carparts.com',
  renderMode: 'static',
  requestDelay: 1500,
  concurrency: 4,
  useProxies: true,
  stealth: false,
  maxPages: 10,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
}

const PART_QUERIES = [
  'brake pads',
  'alternator',
  'transmission',
  'engine',
  'fender',
  'headlight',
  'bumper',
]

export async function scrapeCarPartsCom(maxPagesPerSearch = CARPARTS_COM_CONFIG.maxPages) {
  console.log('[CarParts.com] Starting scrape...')
  const allDeals: Partial<Deal>[] = []

  for (const query of PART_QUERIES) {
    const config = { ...CARPARTS_COM_CONFIG, maxPages: maxPagesPerSearch }
    const gen = paginate<Partial<Deal>>(
      config,
      (page) =>
        `https://www.carparts.com/search?q=${encodeURIComponent(query)}&page=${page}`,
      async (input) => {
        const $ = typeof input === 'string' ? cheerio.load(input) : input
        const items: Partial<Deal>[] = []

        $('div.part-item, div.product-item, [data-testid="product-card"]').each((_: number, el: any) => {
          const row = $(el)
          const title = row.find('h4.part-title, .product-title, h3').text().trim()
          if (!title) return

          const priceText = row.find('span.part-price, .product-price, .price').text().trim()
          const price = extractPrice(priceText)
          if (!price) return

          const link = row.find('a[href*="/product/"]').attr('href') || row.find('a').first().attr('href')
          const imgSrc = row.find('img').first().attr('src')
          const locationText = row.find('span.part-location, .shipping-location').text().trim()
          const itemId = link?.split('/product/')[1]?.split('?')[0] || title.replace(/\s+/g, '-').toLowerCase()

          items.push({
            source: 'carparts_com',
            source_deal_id: itemId,
            source_url: link ? normalizeUrl(link, CARPARTS_COM_CONFIG.baseUrl) : '',
            title,
            ask_price: price,
            condition: 'parts',
            location_city: locationText,
            images: imgSrc ? [imgSrc] : [],
            description: query,
            seller_type: 'dealer',
            scraped_at: new Date().toISOString(),
          })
        })

        const hasMore = $('a.next-page, a.pagination-next, a[rel="next"]').length > 0
        return { items, hasMore }
      }
    )

    for await (const batch of gen) {
      allDeals.push(...batch)
    }
  }

  console.log(`[CarParts.com] Found ${allDeals.length} deals`)
  await upsertDeals(allDeals)
  return allDeals.length
}
