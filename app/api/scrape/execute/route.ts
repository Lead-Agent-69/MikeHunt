export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { EnhancedScrapingEngine } from '@/lib/scrapers/enhanced-engine'
import { SCRAPER_CONFIGS } from '@/lib/scrapers/source-configs'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const scrapingEngine = new EnhancedScrapingEngine(
    process.env.REDIS_URL || 'redis://localhost:6379',
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  try {
    const body = await request.json()
    const { sources, force = false } = body

    // Validate sources
    let configsToScrape = SCRAPER_CONFIGS
    if (sources && Array.isArray(sources)) {
      configsToScrape = SCRAPER_CONFIGS.filter(config => sources.includes(config.name))
    }

    if (configsToScrape.length === 0) {
      return NextResponse.json({ error: 'No valid sources specified' }, { status: 400 })
    }

    // Check if scraping is already in progress
    const redis = scrapingEngine['redis']
    const scrapingStatus = await redis.get('scraping:status')
    
    if (scrapingStatus === 'active' && !force) {
      return NextResponse.json({ 
        error: 'Scraping already in progress',
        status: 'active'
      }, { status: 409 })
    }

    // Set scraping status
    await redis.setex('scraping:status', 3600, 'active')
    await redis.setex('scraping:started', 3600, new Date().toISOString())

    // Start scraping in background
    executeScraping(configsToScrape, scrapingEngine)

    return NextResponse.json({
      message: 'Scraping started',
      sources: configsToScrape.map(c => c.name),
      estimatedTime: configsToScrape.length * 5 // 5 minutes per source
    })

  } catch (error) {
    console.error('Error starting scrape:', error)
    return NextResponse.json({ error: 'Failed to start scraping' }, { status: 500 })
  }
}

async function executeScraping(configs: any[], scrapingEngine: InstanceType<typeof EnhancedScrapingEngine>) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const redis = scrapingEngine['redis']
  
  try {
    // Initialize browser
    await scrapingEngine.initializeBrowser()

    // Track progress
    const totalSources = configs.length
    let completedSources = 0

    const updateProgress = () => {
      const progress = {
        total: totalSources,
        completed: completedSources,
        percentage: Math.round((completedSources / totalSources) * 100)
      }
      redis.setex('scraping:progress', 3600, JSON.stringify(progress))
    }

    // Scrape each source
    for (const config of configs) {
      try {
        console.log(`Starting scrape for ${config.name}`)
        
        // Record scraper run start
        const { data: runData } = await supabase
          .from('scraper_runs')
          .insert({
            source: config.name,
            status: 'running',
            started_at: new Date().toISOString()
          })
          .select()
          .single()

        // Scrape the source
        const deals = await scrapingEngine.scrapeSource(config)
        
        // Save deals to database
        if (deals.length > 0) {
          // Convert deals to database format
          const dbDeals = deals.map(deal => ({
            id: deal.id,
            source: deal.source,
            source_type: deal.sourceType,
            title: deal.title,
            price: deal.price,
            currency: deal.currency,
            year: deal.year,
            make: deal.make,
            model: deal.model,
            vin: deal.vin,
            mileage: deal.mileage,
            location: deal.location,
            description: deal.description,
            images: deal.images,
            auction_end: deal.auctionEnd?.toISOString(),
            bid_count: deal.bidCount,
            seller: deal.seller,
            seller_type: deal.sellerType,
            condition: deal.condition,
            transport_cost: deal.transportCost,
            repair_estimate: deal.repairEstimate,
            profit_score: deal.profitScore,
            scraped_at: deal.scrapedAt.toISOString(),
            url: deal.url,
            metadata: deal.metadata
          }))

          // Insert deals
          const { error: insertError } = await supabase
            .from('deals')
            .upsert(dbDeals, {
              onConflict: 'id',
              ignoreDuplicates: false
            })

          if (insertError) {
            console.error('Error saving deals:', insertError)
          }
        }

        // Update scraper run completion
        await supabase
          .from('scraper_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            deals_found: deals.length,
            deals_saved: deals.length
          })
          .eq('id', runData.id)

        completedSources++
        updateProgress()
        console.log(`Completed scrape for ${config.name}: ${deals.length} deals`)

      } catch (error) {
        console.error(`Failed to scrape ${config.name}:`, error)
        
        // Record failure
        await supabase
          .from('scraper_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('source', config.name)
      }
    }

    // Clean up
    await scrapingEngine.close()

    // Update status
    await redis.set('scraping:status', 'completed')
    await redis.set('scraping:completed', new Date().toISOString())

    console.log('Scraping completed successfully')

  } catch (error) {
    console.error('Background scraping error:', error)
    const redis = scrapingEngine['redis']
    await redis.set('scraping:status', 'error')
    await redis.set('scraping:error', error instanceof Error ? error.message : 'Unknown error')
  }
}
