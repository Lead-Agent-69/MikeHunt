export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { DealsService, DealFilters } from '@/lib/data/deals-service'
import { isSupabaseConfigured } from '@/lib/supabase'

function parseFilters(searchParams: URLSearchParams): DealFilters {
  return {
    source: searchParams.get('source')?.split(',').filter(Boolean),
    make: searchParams.get('make')?.split(',').filter(Boolean),
    condition: searchParams.get('condition')?.split(',').filter(Boolean),
    location: searchParams.get('location') || undefined,
    minProfit: searchParams.get('minProfit') ? parseInt(searchParams.get('minProfit')!, 10) : undefined,
    minScore: searchParams.get('minScore') ? parseInt(searchParams.get('minScore')!, 10) : undefined,
    sortBy: (searchParams.get('sortBy') as DealFilters['sortBy']) || undefined,
    sortOrder: (searchParams.get('sortOrder') as DealFilters['sortOrder']) || undefined,
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
    offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
  }
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local' }, { status: 503 })
  }

  try {
    const dealsService = new DealsService()
    const { searchParams } = new URL(request.url)

    const searchTerm = searchParams.get('search')
    if (searchTerm) {
      const result = await dealsService.searchDeals(searchTerm, parseFilters(searchParams))
      return NextResponse.json(result)
    }

    const hot = searchParams.get('hot')
    if (hot === 'true') {
      const deals = await dealsService.getHotDeals(parseInt(searchParams.get('limit') || '10', 10))
      return NextResponse.json({ deals, total: deals.length, hasMore: false })
    }

    const result = await dealsService.getDeals(parseFilters(searchParams))
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in deals API:', error)
    return NextResponse.json({
      error: 'Failed to fetch deals',
    }, { status: 500 })
  }
}
