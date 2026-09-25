import { chromium, Browser, Page, BrowserContext } from 'playwright'
import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import pRetry from 'p-retry'
import Redis from 'ioredis'
import { createClient } from '@supabase/supabase-js'

// Enhanced scraping configuration
export interface EnhancedScraperConfig {
  name: string
  baseUrl: string
  type: 'auction' | 'marketplace' | 'dealer' | 'parts'
  updateFrequency: number // minutes
  requiresAuth: boolean
  proxyRotation: boolean
  stealthMode: boolean
  selectors: {
    dealContainer: string
    title: string
    price: string
    mileage?: string
    year?: string
    make?: string
    model?: string
    vin?: string
    location?: string
    images?: string
    description?: string
    auctionEnd?: string
    bidCount?: string
    seller?: string
  }
  pagination?: {
    nextSelector: string
    maxPages: number
  }
  rateLimit: {
    requests: number
    perMs: number
  }
}

// Enhanced deal data structure
export interface EnhancedDeal {
  id: string
  source: string
  sourceType: string
  title: string
  price: number
  currency: string
  year?: number
  make?: string
  model?: string
  vin?: string
  mileage?: number
  location?: string
  description?: string
  images: string[]
  auctionEnd?: Date
  bidCount?: number
  seller?: string
  sellerType?: 'dealer' | 'auction' | 'private'
  condition?: 'clean' | 'salvage' | 'rebuilt' | 'parts'
  transportCost?: number
  repairEstimate?: number
  profitScore?: number
  scrapedAt: Date
  url: string
  metadata: Record<string, any>
}

// Proxy configuration
interface ProxyConfig {
  host: string
  port: number
  username?: string
  password?: string
  protocol: 'http' | 'https' | 'socks5'
}

// Enhanced scraper engine
export class EnhancedScrapingEngine {
  private browser: Browser | null = null
  private redis: Redis
  private supabase: any
  private proxyList: ProxyConfig[] = []
  private currentProxyIndex = 0
  private rateLimiters = new Map<string, any>()

  constructor(redisUrl: string, supabaseUrl: string, supabaseKey: string) {
    this.redis = new Redis(redisUrl)
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  // Initialize browser with stealth mode
  async initializeBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    })
  }

  // Get next proxy from rotation
  private getNextProxy(): ProxyConfig | undefined {
    if (this.proxyList.length === 0) return undefined
    const proxy = this.proxyList[this.currentProxyIndex]
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length
    return proxy
  }

  // Create stealth context
  private async createStealthContext(): Promise<BrowserContext> {
    const proxy = this.getNextProxy()
    
    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      proxy: proxy ? {
        server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password
      } : undefined,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    })

    // Add stealth scripts
    await context.addInitScript(() => {
      // Hide automation indicators
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
      ;(window as any).chrome = { runtime: {} }
    })

    return context
  }

  // Rate limiting
  private getRateLimiter(config: EnhancedScraperConfig) {
    const key = config.name
    if (!this.rateLimiters.has(key)) {
      const limiter = pLimit(config.rateLimit.requests)
      this.rateLimiters.set(key, limiter)
    }
    return this.rateLimiters.get(key)
  }

  // Extract deal data from page
  private async extractDeals(page: Page, config: EnhancedScraperConfig): Promise<EnhancedDeal[]> {
    const deals: EnhancedDeal[] = []
    
    try {
      // Wait for deals to load
      await page.waitForSelector(config.selectors.dealContainer, { timeout: 10000 })
      
      // Get all deal containers
      const containers = await page.$$(config.selectors.dealContainer)
      
      for (const container of containers) {
        try {
          const deal: Partial<EnhancedDeal> = {
            source: config.name,
            sourceType: config.type,
            images: [],
            scrapedAt: new Date(),
            metadata: {}
          }

          // Extract basic info
          deal.title = await container.$eval(config.selectors.title, el => el.textContent?.trim() || '')
          deal.price = await this.extractPrice(container, config.selectors.price)
          
          // Extract optional fields
          if (config.selectors.year) {
            const yearText = await container.$eval(config.selectors.year, el => el.textContent?.trim() || '')
            deal.year = this.extractYear(yearText)
          }
          
          if (config.selectors.make) {
            deal.make = await container.$eval(config.selectors.make, el => el.textContent?.trim() || '')
          }
          
          if (config.selectors.model) {
            deal.model = await container.$eval(config.selectors.model, el => el.textContent?.trim() || '')
          }
          
          if (config.selectors.vin) {
            deal.vin = await container.$eval(config.selectors.vin, el => el.textContent?.trim() || '')
          }
          
          if (config.selectors.mileage) {
            const mileageText = await container.$eval(config.selectors.mileage, el => el.textContent?.trim() || '')
            deal.mileage = this.extractMileage(mileageText)
          }
          
          if (config.selectors.location) {
            deal.location = await container.$eval(config.selectors.location, el => el.textContent?.trim() || '')
          }
          
          if (config.selectors.description) {
            deal.description = await container.$eval(config.selectors.description, el => el.textContent?.trim() || '')
          }
          
          if (config.selectors.images) {
            deal.images = await container.$$eval(config.selectors.images, (els: Element[]) => 
              els.map(el => el.getAttribute('src') || '').filter(Boolean)
            )
          }
          
          if (config.selectors.auctionEnd) {
            const endText = await container.$eval(config.selectors.auctionEnd, el => el.textContent?.trim() || '')
            deal.auctionEnd = this.parseAuctionEnd(endText)
          }
          
          if (config.selectors.bidCount) {
            const bidText = await container.$eval(config.selectors.bidCount, el => el.textContent?.trim() || '')
            deal.bidCount = this.extractNumber(bidText)
          }
          
          if (config.selectors.seller) {
            deal.seller = await container.$eval(config.selectors.seller, el => el.textContent?.trim() || '')
          }
          
          // Generate unique ID
          deal.id = this.generateDealId(deal)
          
          // Get deal URL
          const linkElement = await container.$('a')
          if (linkElement) {
            deal.url = await linkElement.getAttribute('href') || ''
          }
          
          // Calculate profit score
          deal.profitScore = this.calculateProfitScore(deal as EnhancedDeal)
          
          deals.push(deal as EnhancedDeal)
        } catch (error) {
          console.error(`Error extracting deal from ${config.name}:`, error)
        }
      }
    } catch (error) {
      console.error(`Error waiting for deals on ${config.name}:`, error)
    }
    
    return deals
  }

  // Extract price from text
  private async extractPrice(container: any, selector: string): Promise<number> {
    try {
      const priceText = await container.$eval(selector, (el: Element) => el.textContent?.trim() || '')
      return this.extractNumber(priceText)
    } catch {
      return 0
    }
  }

  // Extract number from text
  private extractNumber(text: string): number {
    const match = text.match(/\$?([\d,]+)/)
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0
  }

  // Extract year from text
  private extractYear(text: string): number | undefined {
    const match = text.match(/\b(19|20)\d{2}\b/)
    return match ? parseInt(match[0], 10) : undefined
  }

  // Extract mileage from text
  private extractMileage(text: string): number | undefined {
    const match = text.match(/([\d,]+)\s*(mi|km|miles|kilometers)/i)
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : undefined
  }

  // Parse auction end time
  private parseAuctionEnd(text: string): Date | undefined {
    // Handle various auction end formats
    const now = new Date()
    if (text.includes('min')) {
      const minutes = this.extractNumber(text)
      return new Date(now.getTime() + minutes * 60 * 1000)
    }
    if (text.includes('hour')) {
      const hours = this.extractNumber(text)
      return new Date(now.getTime() + hours * 60 * 60 * 1000)
    }
    if (text.includes('day')) {
      const days = this.extractNumber(text)
      return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    }
    return undefined
  }

  // Generate unique deal ID
  private generateDealId(deal: Partial<EnhancedDeal>): string {
    const parts = [
      deal.source,
      deal.year || '',
      deal.make || '',
      deal.model || '',
      deal.vin || '',
      deal.price || ''
    ].filter(Boolean).join('-').toLowerCase()
    
    return Buffer.from(parts).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)
  }

  // Calculate profit score
  private calculateProfitScore(deal: EnhancedDeal): number {
    let score = 50 // Base score
    
    // Price factors
    if (deal.price < 5000) score += 20
    else if (deal.price < 10000) score += 15
    else if (deal.price < 20000) score += 10
    
    // Age factors
    if (deal.year) {
      const age = new Date().getFullYear() - deal.year
      if (age <= 3) score += 15
      else if (age <= 7) score += 10
      else if (age <= 12) score += 5
    }
    
    // Mileage factors
    if (deal.mileage) {
      if (deal.mileage < 50000) score += 10
      else if (deal.mileage < 100000) score += 5
    }
    
    // Condition factors
    if (deal.condition === 'clean') score += 15
    else if (deal.condition === 'rebuilt') score -= 10
    else if (deal.condition === 'parts') score -= 20
    
    return Math.min(100, Math.max(0, score))
  }

  // Scrape single source
  async scrapeSource(config: EnhancedScraperConfig): Promise<EnhancedDeal[]> {
    const limiter = this.getRateLimiter(config)
    
    return limiter(async () => {
      return pRetry(async () => {
        const context = await this.createStealthContext()
        const page = await context.newPage()
        
        try {
          console.log(`Scraping ${config.name}...`)
          
          // Navigate to source
          await page.goto(config.baseUrl, { waitUntil: 'networkidle' })
          
          // Handle authentication if required
          if (config.requiresAuth) {
            await this.handleAuthentication(page, config)
          }
          
          const allDeals: EnhancedDeal[] = []
          let currentPage = 1
          
          while (currentPage <= (config.pagination?.maxPages || 1)) {
            console.log(`Scraping page ${currentPage} of ${config.name}...`)
            
            // Extract deals from current page
            const deals = await this.extractDeals(page, config)
            allDeals.push(...deals)
            
            // Check if there's a next page
            if (config.pagination) {
              const nextButton = await page.$(config.pagination.nextSelector)
              if (!nextButton || currentPage >= config.pagination.maxPages) {
                break
              }
              
              await nextButton.click()
              await page.waitForLoadState('networkidle')
              currentPage++
            } else {
              break
            }
          }
          
          console.log(`Scraped ${allDeals.length} deals from ${config.name}`)
          return allDeals
          
        } finally {
          await context.close()
        }
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          console.error(`Failed to scrape ${config.name}, attempt ${error.attemptNumber}:`, error)
        }
      })
    })
  }

  // Handle authentication (to be implemented per source)
  private async handleAuthentication(page: Page, config: EnhancedScraperConfig): Promise<void> {
    // Implementation would vary per source
    console.log(`Handling authentication for ${config.name}...`)
  }

  // Save deals to database
  async saveDeals(deals: EnhancedDeal[]): Promise<void> {
    if (deals.length === 0) return
    
    try {
      // Batch upsert to database
      const { data, error } = await this.supabase
        .from('deals')
        .upsert(deals, {
          onConflict: 'id',
          ignoreDuplicates: false
        })
      
      if (error) {
        console.error('Error saving deals:', error)
      } else {
        console.log(`Saved ${deals.length} deals to database`)
      }
      
      // Cache in Redis for quick access
      const pipeline = this.redis.pipeline()
      for (const deal of deals) {
        pipeline.setex(`deal:${deal.id}`, 3600, JSON.stringify(deal))
      }
      await pipeline.exec()
      
    } catch (error) {
      console.error('Error in saveDeals:', error)
    }
  }

  // Main scraping orchestration
  async scrapeAllSources(configs: EnhancedScraperConfig[]): Promise<void> {
    if (!this.browser) {
      await this.initializeBrowser()
    }
    
    console.log(`Starting to scrape ${configs.length} sources...`)
    
    // Scrape all sources concurrently
    const results = await Promise.allSettled(
      configs.map(config => this.scrapeSource(config))
    )
    
    // Process results
    const allDeals: EnhancedDeal[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allDeals.push(...result.value)
      } else {
        console.error('Source scraping failed:', result.reason)
      }
    }
    
    // Save all deals
    await this.saveDeals(allDeals)
    
    console.log(`Scraping complete. Total deals: ${allDeals.length}`)
  }

  // Close browser
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
    await this.redis.quit()
  }
}
