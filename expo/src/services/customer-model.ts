export type CoreCustomerOrder = {
  id: string
  order_number: string | null
  status: string
  payment_status: string
  total: number
  created_at: string
  updated_at: string
}

export type CoreCustomerReferral = {
  id: string
  referred_customer_id: string | null
  referred_name: string | null
  referred_email: string | null
  referral_code: string | null
  status: string
  reward_type: string | null
  reward_value: number | null
  referred_at: string
  qualified_at: string | null
  converted_at: string | null
  qualifying_order_number: string | null
}

export type CoreCustomerReward = {
  id: string
  reward_type: string
  reward_value: number | null
  title: string | null
  description: string | null
  status: string
  milestone_threshold: number | null
  reserved_at: string | null
  redeemed_at: string | null
  expires_at: string | null
  created_at: string
}

export type CoreCustomer = {
  id: string
  customer_number: string | null
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  account_status: string
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  preferred_contact_method: string | null
  notes: string | null
  original_created_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
  referral_code: string | null
  membership: {
    id: string
    name: string
    slug: string
    description: string | null
    benefits: unknown
  } | null
  metrics: {
    order_count: number
    paid_order_count: number
    lifetime_spend: number
    latest_order_at: string | null
    referral_count: number
    qualified_referral_count: number
    available_reward_count: number
  }
  orders: CoreCustomerOrder[]
  referrals: CoreCustomerReferral[]
  rewards: CoreCustomerReward[]
}

export type CoreMembership = NonNullable<CoreCustomer['membership']>

export type CoreCustomersWorkspace = {
  customers: CoreCustomer[]
  memberships: CoreMembership[]
}


export const customerDisplayName = (customer: CoreCustomer) =>
  [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer';
export function matchesCustomer(customer: CoreCustomer, query: string, membership: string) {
  if (membership !== 'all' && customer.membership?.slug !== membership) return false;
  const q = query.trim().toLowerCase();
  return !q || [customerDisplayName(customer), customer.customer_number, customer.email, customer.phone,
    customer.referral_code, customer.membership?.name].filter(Boolean).join(' ').toLowerCase().includes(q);
}
export const profileFields = [
  ['firstName', 'First name', 'first_name', 80], ['lastName', 'Last name', 'last_name', 80],
  ['phone', 'Phone', 'phone', 40], ['addressLine1', 'Address line 1', 'address_line_1', 160],
  ['addressLine2', 'Address line 2', 'address_line_2', 160], ['city', 'City', 'city', 100],
  ['state', 'State', 'state', 80], ['postalCode', 'Postal code', 'postal_code', 30],
] as const;
export type CustomerProfileDraft = Record<typeof profileFields[number][0], string>;
export function profileDraft(customer: CoreCustomer): CustomerProfileDraft {
  return Object.fromEntries(profileFields.map(([key, , field]) => [key, customer[field] || ''])) as CustomerProfileDraft;
}
export function validateProfile(draft: CustomerProfileDraft) {
  return Object.fromEntries(profileFields.map(([key, label, , limit]) => {
    const value = draft[key].trim();
    if (value.length > limit) throw new Error(`${label} must be ${limit} characters or fewer.`);
    return [key, value];
  })) as CustomerProfileDraft;
}
