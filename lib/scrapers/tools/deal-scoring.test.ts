import { describe, it, expect } from 'vitest'
import { DealScoringService } from './deal-scoring'

describe('DealScoringService', () => {
  const scorer = new DealScoringService()

  it('returns empty result when no price', () => {
    const result = scorer.score({ askPrice: 0 })
    expect(result.profitScore).toBe(0)
    expect(result.confidence).toBe('low')
  })

  it('flags a strong arbitrage opportunity', () => {
    const result = scorer.score({
      askPrice: 10000,
      retailEstimate: 18000,
      transportCost: 500,
      repairEstimate: 500,
      mileage: 50000,
      year: 2020,
    })
    expect(result.arbitrage).toBe(true)
    expect(result.profitScore).toBeGreaterThan(50)
    expect(result.profitEstimate).toBe(7000)
  })

  it('scores a deal object', () => {
    const deal = scorer.scoreDeal({
      source: 'copart',
      title: '2019 Honda Accord',
      ask_price: 8000,
      ai_retail_estimate: 15000,
      transport_cost: 600,
      repair_estimate: 400,
      mileage: 45000,
      year: 2019,
    })
    expect(deal.profit_estimate).toBeGreaterThan(0)
    expect(deal.profit_score).toBeGreaterThan(0)
    expect(deal.is_arbitrage_opportunity).toBe(true)
  })
})
