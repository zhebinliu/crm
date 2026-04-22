// Business enums — mirror Salesforce defaults but are configurable via picklists.

export const LEAD_STATUS = ['new', 'working', 'nurturing', 'qualified', 'unqualified'] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const LEAD_RATING = ['hot', 'warm', 'cold'] as const;
export type LeadRating = (typeof LEAD_RATING)[number];

export const OPPORTUNITY_STAGE = [
  'prospecting',
  'qualification',
  'needs_analysis',
  'value_proposition',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGE)[number];

export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  prospecting: 10,
  qualification: 20,
  needs_analysis: 30,
  value_proposition: 50,
  proposal: 65,
  negotiation: 80,
  closed_won: 100,
  closed_lost: 0,
};

export const STAGE_FORECAST: Record<OpportunityStage, 'pipeline' | 'best_case' | 'commit' | 'closed'> = {
  prospecting: 'pipeline',
  qualification: 'pipeline',
  needs_analysis: 'pipeline',
  value_proposition: 'best_case',
  proposal: 'best_case',
  negotiation: 'commit',
  closed_won: 'closed',
  closed_lost: 'closed',
};

export const QUOTE_STATUS = [
  'draft',
  'in_review',
  'approved',
  'presented',
  'accepted',
  'rejected',
  'expired',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number];

export const ORDER_STATUS = ['draft', 'activated', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const CONTRACT_STATUS = ['draft', 'in_approval', 'activated', 'expired', 'terminated'] as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[number];

export const ACCOUNT_TYPE = ['customer', 'prospect', 'partner', 'competitor', 'reseller'] as const;
export const INDUSTRIES = [
  'technology',
  'finance',
  'manufacturing',
  'retail',
  'healthcare',
  'education',
  'government',
  'energy',
  'media',
  'other',
] as const;
export const LEAD_SOURCES = [
  'web',
  'phone',
  'email',
  'referral',
  'campaign',
  'advertisement',
  'partner',
  'trade_show',
  'other',
] as const;
