import { describe, it, expect } from 'vitest'
import { normalizeDeal, normalizeVin, normalizeTitle, extractYear, extractMake, extractModel } from './deal-normalizer'

describe('deal normalizer', () => {
  it('normalizes VIN to 17 uppercase chars', () => {
    expect(normalizeVin('1hgcm82633a123456')).toBe('1HGCM82633A123456')
    expect(normalizeVin('abc')).toBeUndefined()
  })

  it('cleans and trims title', () => {
    expect(normalizeTitle('  2019   Honda  Accord  ')).toBe('2019 Honda Accord')
  })

  it('extracts year, make, model from title', () => {
    expect(extractYear('2020 Toyota Camry')).toBe(2020)
    expect(extractMake('2019 Ford F-150')).toBe('Ford')
    expect(extractModel('2019 Ford F-150', 'Ford')).toBe('F-150')
  })

  it('normalizes a full deal', () => {
    const deal = normalizeDeal({
      source: 'test',
      title: '  2019   honda  accord  ',
      vin: '1hgcm82633a123456',
      ask_price: 12000.7,
      mileage: 45000.2,
      location_city: 'Austin ',
      location_state: ' TX',
    })
    expect(deal.title).toBe('2019 honda accord')
    expect(deal.vin).toBe('1HGCM82633A123456')
    expect(deal.year).toBe(2019)
    expect(deal.make).toBe('Honda')
    expect(deal.model).toBe('Accord')
    expect(deal.ask_price).toBe(12001)
    expect(deal.mileage).toBe(45000)
    expect(deal.location_city).toBe('Austin')
    expect(deal.location_state).toBe('TX')
  })
})
