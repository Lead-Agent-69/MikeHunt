// lib/scrapers/tools/deal-scoring.ts
// Rule-based deal scoring. Avoids AI costs on every deal while still giving customers an edge.
// Optional AI enrichment only for high-confidence opportunities.

import { Deal } from '@/types'

export interface DealScoreInput {
  askPrice: number
  wholesaleEstimate?: number
  retailEstimate?: number
  transportCost?: number
  repairEstimate?: number
  mileage?: number
  year?: number
  condition?: string
  source?: string
}

export interface DealScoreResult {
  profitEstimate: number
  profitScore: number // 0-100
  roiPct: number
  allInCost: number
  arbitrage: boolean
  confidence: 'low' | 'medium' | 'high'
  rationale: string
}

export class DealScoringService {
  // Conservative rule-based scoring. No API calls.
  score(input: DealScoreInput): DealScoreResult {
    const {
      askPrice = 0,
      wholesaleEstimate,
      retailEstimate,
      transportCost = 0,
      repairEstimate = 0,
      mileage,
      year,
      condition,
    } = input

    if (!askPrice || askPrice <= 0) {
      return this.emptyResult()
    }

    const allInCost = askPrice + transportCost + repairEstimate

    // If we have wholesale/retail estimates, use them. Otherwise estimate retail from ask price.
    let targetValue = retailEstimate || wholesaleEstimate
    let basis = 'retail/wholesale estimate'

    if (!targetValue) {
      // Fallback: assume clean retail is ~1.25x ask for auction/salvage sources, 1.1x for marketplace
      const markup = this.guessMarkup(input.source, condition)
      targetValue = Math.round(askPrice * markup)
      basis = 'estimated retail markup'
    }

    const profitEstimate = targetValue - allInCost
    const roiPct = (profitEstimate / allInCost) * 100

    // Score components
    let score = 0
    if (profitEstimate > 2000) score += 25
    if (profitEstimate > 5000) score += 20
    if (roiPct > 10) score += 20
    if (roiPct > 20) score += 15
    if (mileage !== undefined && mileage < 100000) score += 10
    if (year !== undefined && year >= new Date().getFullYear() - 8) score += 10

    const arbitrage = profitEstimate > 3000 && roiPct > 12
    const confidence = wholesaleEstimate && retailEstimate ? 'high' : profitEstimate > 5000 ? 'medium' : 'low'

    return {
      profitEstimate,
      profitScore: Math.min(100, Math.max(0, score)),
      roiPct,
      allInCost,
      arbitrage,
      confidence,
      rationale: `Profit $${profitEstimate.toLocaleString()} (${roiPct.toFixed(1)}% ROI) vs ${basis}. All-in cost $${allInCost.toLocaleString()}.`,
    }
  }

  private emptyResult(): DealScoreResult {
    return {
      profitEstimate: 0,
      profitScore: 0,
      roiPct: 0,
      allInCost: 0,
      arbitrage: false,
      confidence: 'low',
      rationale: 'Insufficient pricing data to score.',
    }
  }

  private guessMarkup(source?: string, condition?: string): number {
    if (condition === 'salvage' || condition === 'parts') return 1.35
    if (source === 'copart' || source === 'iaa') return 1.3
    if (source === 'acv' || source === 'adesa' || source === 'manheim') return 1.2
    if (source === 'craigslist' || source === 'facebook-marketplace') return 1.15
    return 1.25
  }

  // Apply scoring to a deal object and return enriched fields
  scoreDeal(deal: Partial<Deal>): Partial<Deal> {
    const score = this.score({
      askPrice: deal.ask_price || 0,
      wholesaleEstimate: deal.ai_wholesale_estimate,
      retailEstimate: deal.ai_retail_estimate,
      transportCost: deal.transport_cost,
      repairEstimate: deal.repair_estimate,
      mileage: deal.mileage,
      year: deal.year,
      condition: deal.condition,
      source: deal.source,
    })

    return {
      ...deal,
      profit_estimate: score.profitEstimate,
      profit_score: score.profitScore,
      is_arbitrage_opportunity: score.arbitrage,
    }
  }
}
