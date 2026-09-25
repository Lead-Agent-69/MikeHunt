export const TITLE_RULES: Record<string, {
  warning: boolean
  note: string
  requirements: string[]
}> = {
  'TX-CA': {
    warning: true,
    note: 'CA requires smog check before registration. TX dealers need CA wholesale license to retail into CA.',
    requirements: ['CA smog check', 'Signed title both sides', 'Odometer disclosure', 'Bill of Sale', '90-day temp permit from TX DMV'],
  },
  'OH-CA': {
    warning: true,
    note: 'CRITICAL: CA will not issue clean title for OH salvage/rebuilt titles without CA inspection.',
    requirements: ['CA salvage inspection if rebuilt/salvage', 'CA smog check', 'Signed title', 'Odometer disclosure'],
  },
  'FL-NY': {
    warning: true,
    note: 'NY requires state safety inspection before plates. Buyer cannot register without passing.',
    requirements: ['NY safety inspection', 'Signed title', 'Odometer disclosure', 'Bill of Sale', 'Buyer insurance before plates'],
  },
  'TX-WA': {
    warning: true,
    note: 'WA requires VIN inspection at port of entry for out-of-state vehicles.',
    requirements: ['WA VIN inspection', 'Signed title', '15-day transit permit', 'Bill of Sale'],
  },
  'FL-TX': {
    warning: false,
    note: 'Straightforward transfer. TX safety inspection required before registration.',
    requirements: ['TX safety inspection', 'Signed title', 'Odometer disclosure', 'Bill of Sale'],
  },
  'MO-TX': {
    warning: false,
    note: 'Clean and simple. TX safety inspection required at registration.',
    requirements: ['TX safety inspection', 'Signed title', 'Odometer disclosure', 'Bill of Sale'],
  },
  'GA-NY': {
    warning: true,
    note: 'NY safety inspection required before plates. Notarized title preferred but not required.',
    requirements: ['NY safety inspection', 'Signed title', 'Odometer disclosure', 'Notarized title recommended'],
  },
  'MI-WA': {
    warning: true,
    note: 'WA VIN inspection required. Request 10-day transit permit from MI DMV.',
    requirements: ['WA VIN inspection', 'MI 10-day transit permit', 'Signed title', 'Bill of Sale'],
  },
  'TN-CO': {
    warning: true,
    note: 'CO emissions test required for Front Range counties (Denver metro, Boulder, etc).',
    requirements: ['CO emissions test (front range)', 'Signed title', 'Odometer disclosure', 'Bill of Sale'],
  },
  'AZ-WA': {
    warning: true,
    note: 'AZ is a lien-hold state. Verify full lien release before purchase.',
    requirements: ['Lien release verified', 'WA VIN inspection', 'Signed title', 'Bill of Sale'],
  },
}

export const DEFAULT_REQUIREMENTS = [
  'Signed title (seller and buyer sections complete)',
  'Odometer disclosure statement',
  'Bill of Sale (VIN, price, date, both signatures)',
  'Lien release if vehicle was financed',
  'Temporary transit permit from seller state DMV',
  'Buyer registers in their state within 30 days',
]

export function getTitleRules(fromState: string, toState: string) {
  const key = `${fromState.toUpperCase()}-${toState.toUpperCase()}`
  return TITLE_RULES[key] ?? { warning: false, note: 'Standard title transfer. Verify state-specific DMV requirements.', requirements: DEFAULT_REQUIREMENTS }
}

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]
