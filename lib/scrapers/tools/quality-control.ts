// lib/scrapers/tools/quality-control.ts
// Validates scraped data, detects duplicates, and computes quality scores.

import { Deal } from '@/types'

export interface ValidationRule {
  name: string
  validate: (deal: Partial<Deal>) => { valid: boolean; reason?: string }
}

export interface QualityReport {
  source: string
  total: number
  valid: number
  invalid: number
  duplicates: number
  validDeals: Partial<Deal>[]
  issues: { index: number; field: string; reason: string }[]
  score: number
  recommendations: string[]
}

export class QualityController {
  private rules: ValidationRule[]
  private seenKeys: Set<string> = new Set()

  constructor(rules?: ValidationRule[]) {
    this.rules = rules || this.defaultRules()
  }

  private defaultRules(): ValidationRule[] {
    return [
      {
        name: 'required_fields',
        validate: (l) => {
          if (!l.title || l.title.trim().length < 3) return { valid: false, reason: 'missing title' }
          if (!l.source) return { valid: false, reason: 'missing source' }
          if (l.ask_price === undefined || l.ask_price === null || l.ask_price < 0) return { valid: false, reason: 'missing or invalid price' }
          return { valid: true }
        },
      },
      {
        name: 'price_range',
        validate: (l) => {
          if (l.ask_price! < 100) return { valid: false, reason: 'price too low (< $100)' }
          if (l.ask_price! > 1000000) return { valid: false, reason: 'price too high (> $1M)' }
          return { valid: true }
        },
      },
      {
        name: 'year_range',
        validate: (l) => {
          if (!l.year) return { valid: true }
          const currentYear = new Date().getFullYear() + 1
          if (l.year < 1900 || l.year > currentYear) return { valid: false, reason: `invalid year ${l.year}` }
          return { valid: true }
        },
      },
      {
        name: 'vin_format',
        validate: (l) => {
          if (!l.vin) return { valid: true }
          if (l.vin.length !== 17) return { valid: false, reason: 'VIN must be 17 characters' }
          return { valid: true }
        },
      },
      {
        name: 'mileage_range',
        validate: (l) => {
          if (l.mileage === undefined || l.mileage === null) return { valid: true }
          if (l.mileage < 0 || l.mileage > 2000000) return { valid: false, reason: 'invalid mileage' }
          return { valid: true }
        },
      },
    ]
  }

  validateBatch(source: string, deals: Partial<Deal>[]): QualityReport {
    const issues: { index: number; field: string; reason: string }[] = []
    const validDeals: Partial<Deal>[] = []
    let duplicates = 0

    for (let i = 0; i < deals.length; i++) {
      const deal = deals[i]
      let isValid = true

      for (const rule of this.rules) {
        const result = rule.validate(deal)
        if (!result.valid) {
          isValid = false
          issues.push({ index: i, field: rule.name, reason: result.reason || 'validation failed' })
        }
      }

      if (isValid) {
        const key = this.makeKey(deal)
        if (this.seenKeys.has(key)) {
          duplicates += 1
          issues.push({ index: i, field: 'duplicate', reason: 'duplicate within batch' })
        } else {
          this.seenKeys.add(key)
          validDeals.push(deal)
        }
      }
    }

    const total = deals.length
    const valid = validDeals.length
    const invalid = total - valid - duplicates
    const score = total > 0 ? Math.round((valid / total) * 100) : 0

    return {
      source,
      total,
      valid,
      invalid,
      duplicates,
      validDeals,
      issues,
      score,
      recommendations: this.generateRecommendations(total, valid, duplicates, issues),
    }
  }

  private makeKey(deal: Partial<Deal>): string {
    return [
      deal.source,
      deal.vin || deal.title?.toLowerCase(),
      deal.ask_price,
      deal.location_state,
      deal.location_city,
    ].join('|')
  }

  private generateRecommendations(total: number, valid: number, duplicates: number, issues: { field: string }[]): string[] {
    const recs: string[] = []
    if (total === 0) recs.push('No deals were scraped; check source health.')
    if (valid / total < 0.8) recs.push('Low valid-deal rate; review extraction selectors.')
    if (duplicates > 0) recs.push(`${duplicates} duplicates detected; improve deduplication.`)
    const fieldCounts = issues.reduce((acc, issue) => {
      acc[issue.field] = (acc[issue.field] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    for (const [field, count] of Object.entries(fieldCounts)) {
      if (count > 5 && field !== 'duplicate') recs.push(`Many issues with ${field} (${count}); consider fixing selectors.`)
    }
    return recs
  }

  reset() {
    this.seenKeys.clear()
  }
}
