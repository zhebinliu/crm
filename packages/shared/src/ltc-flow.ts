// Canonical event names emitted on the outbox/event bus.
// Format: "<object>.<verb>"

export const EVENTS = {
  // Lead
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_QUALIFIED: 'lead.qualified',
  LEAD_CONVERTED: 'lead.converted',
  LEAD_DELETED: 'lead.deleted',

  // Account / Contact
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_UPDATED: 'account.updated',
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',

  // Opportunity
  OPP_CREATED: 'opportunity.created',
  OPP_UPDATED: 'opportunity.updated',
  OPP_STAGE_CHANGED: 'opportunity.stage_changed',
  OPP_WON: 'opportunity.won',
  OPP_LOST: 'opportunity.lost',

  // Quote
  QUOTE_CREATED: 'quote.created',
  QUOTE_UPDATED: 'quote.updated',
  QUOTE_SUBMITTED: 'quote.submitted_for_approval',
  QUOTE_APPROVED: 'quote.approved',
  QUOTE_REJECTED: 'quote.rejected',
  QUOTE_ACCEPTED: 'quote.accepted',

  // Order
  ORDER_CREATED: 'order.created',
  ORDER_ACTIVATED: 'order.activated',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_CANCELLED: 'order.cancelled',

  // Contract
  CONTRACT_CREATED: 'contract.created',
  CONTRACT_ACTIVATED: 'contract.activated',
  CONTRACT_TERMINATED: 'contract.terminated',

  // Approval
  APPROVAL_SUBMITTED: 'approval.submitted',
  APPROVAL_STEP_APPROVED: 'approval.step_approved',
  APPROVAL_FINALIZED: 'approval.finalized',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_RECALLED: 'approval.recalled',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// Standard object api names (stable identifiers used in workflow/validation rules).
export const STANDARD_OBJECTS = [
  'lead',
  'account',
  'contact',
  'opportunity',
  'product',
  'pricebook',
  'quote',
  'order',
  'contract',
  'activity',
] as const;
export type StandardObject = (typeof STANDARD_OBJECTS)[number];
