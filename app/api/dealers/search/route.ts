export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { DealerDiscoveryEngine } from '@/lib/dealers/dealer-discovery'


export async function POST(request: NextRequest) {
  try {
    const dealerEngine = new DealerDiscoveryEngine()
    const body = await request.json()
    const { criteria, action = 'search' } = body

    let result

    switch (action) {
      case 'search':
        result = await dealerEngine.searchDealers(criteria || {})
        break
      case 'recommendations':
        if (!criteria || !criteria.userPreferences) {
          return NextResponse.json({ 
            error: 'User preferences are required for recommendations' 
          }, { status: 400 })
        }
        result = await dealerEngine.generateDealerRecommendations(criteria.userPreferences)
        break
      default:
        return NextResponse.json({ 
          error: 'Invalid action. Use search or recommendations' 
        }, { status: 400 })
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error in dealer search:', error)
    return NextResponse.json({ 
      error: 'Failed to search dealers' 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const dealerEngine = new DealerDiscoveryEngine()
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const action = searchParams.get('action')
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const radius = searchParams.get('radius')

    let result

    switch (action) {
      case 'stats':
        if (!state) {
          return NextResponse.json({ 
            error: 'State parameter is required for stats action' 
          }, { status: 400 })
        }
        result = await dealerEngine.getStateDealerStats(state)
        break
      case 'nearby':
        if (!lat || !lng) {
          return NextResponse.json({ 
            error: 'Latitude and longitude are required for nearby action' 
          }, { status: 400 })
        }
        const coordinates: [number, number] = [parseFloat(lat), parseFloat(lng)]
        const maxRadius = radius ? parseInt(radius) : 100
        result = await dealerEngine.getDealersNearCoordinates(coordinates, maxRadius)
        break
      case 'top':
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10
        result = await dealerEngine.getTopDealersByProfit(limit)
        break
      default:
        // Default search with basic parameters
        const criteria: any = {}
        if (state) criteria.states = [state]
        if (searchParams.get('type')) criteria.dealerTypes = [searchParams.get('type') as any]
        if (searchParams.get('minPrice')) criteria.priceRange = { min: parseInt(searchParams.get('minPrice')!), max: 999999 }
        if (searchParams.get('maxPrice')) criteria.priceRange = { ...criteria.priceRange, max: parseInt(searchParams.get('maxPrice')!) }
        if (searchParams.get('limit')) criteria.limit = parseInt(searchParams.get('limit')!)
        
        result = await dealerEngine.searchDealers(criteria)
        break
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error getting dealer data:', error)
    return NextResponse.json({ 
      error: 'Failed to get dealer data' 
    }, { status: 500 })
  }
}
