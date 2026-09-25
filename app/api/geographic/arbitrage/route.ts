export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { GeographicArbitrageEngine } from '@/lib/geographic/geographic-arbitrage'


export async function POST(request: NextRequest) {
  try {
    const geoEngine = new GeographicArbitrageEngine()
    const body = await request.json()
    const { vehicle, action = 'opportunities' } = body

    // Validate vehicle info
    if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model || !vehicle.sourceState) {
      return NextResponse.json({ 
        error: 'Vehicle year, make, model, and source state are required' 
      }, { status: 400 })
    }

    let result

    switch (action) {
      case 'opportunities':
        result = await geoEngine.findArbitrageOpportunities(vehicle)
        break
      case 'trends':
        result = await geoEngine.getRegionalPriceTrends(vehicle.sourceState)
        break
      case 'routes':
        const { targetStates } = body
        if (!targetStates || !Array.isArray(targetStates)) {
          return NextResponse.json({ 
            error: 'Target states array is required for routes action' 
          }, { status: 400 })
        }
        result = await geoEngine.getOptimalTransportRoutes(vehicle.sourceState, targetStates)
        break
      default:
        return NextResponse.json({ 
          error: 'Invalid action. Use opportunities, trends, or routes' 
        }, { status: 400 })
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error in geographic arbitrage:', error)
    return NextResponse.json({ 
      error: 'Failed to perform geographic arbitrage analysis' 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const geoEngine = new GeographicArbitrageEngine()
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const action = searchParams.get('action')

    if (!state) {
      return NextResponse.json({ 
        error: 'State parameter is required' 
      }, { status: 400 })
    }

    let result

    switch (action) {
      case 'trends':
        const timeRange = searchParams.get('timeRange') as 'week' | 'month' | 'quarter' || 'month'
        result = await geoEngine.getRegionalPriceTrends(state, timeRange)
        break
      default:
        return NextResponse.json({ 
          error: 'Invalid action. Use trends' 
        }, { status: 400 })
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error getting geographic data:', error)
    return NextResponse.json({ 
      error: 'Failed to get geographic data' 
    }, { status: 500 })
  }
}
