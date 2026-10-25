import { invokeCore } from './invoke';
import { validateProfile, type CoreCustomer, type CoreCustomersWorkspace, type CustomerProfileDraft } from './customer-model';
type ProfileFields = 'first_name' | 'last_name' | 'phone' | 'address_line_1' | 'address_line_2' | 'city' | 'state' | 'postal_code';
export type CustomerPatch = Pick<CoreCustomer, 'id' | 'updated_at'> & Partial<Pick<CoreCustomer, ProfileFields | 'notes' | 'preferred_contact_method'>>;
export async function loadCustomers(): Promise<CoreCustomersWorkspace> {
  const data = await invokeCore<CoreCustomersWorkspace & { success: boolean }>('core-customers');
  if (data.success !== true || !Array.isArray(data.customers) || !Array.isArray(data.memberships)) throw new Error('Could not load customers. Try again.');
  return { customers: data.customers, memberships: data.memberships };
}
async function mutate(customerId: string, action: string, fields: Record<string, unknown>, required: string[]) {
  // Mutations are not automatically retried: the server also records audit events.
  const data = await invokeCore<{ success: boolean; customer: CustomerPatch }>(
    'core-customer-control', { action, customerId, ...fields }, { retry: false },
  );
  if (data.success !== true || data.customer?.id !== customerId || required.some(key => !(key in data.customer))) {
    throw new Error('Could not confirm the saved change. Refresh customers before retrying.');
  }
  return data.customer;
}
export function saveCustomerNotes(customerId: string, notes: string) {
  if (notes.length > 2000) throw new Error('Notes must be 2000 characters or fewer.');
  return mutate(customerId, 'update_notes', { notes }, ['notes']);
}
export function saveContactPreference(customerId: string, method: string | null) {
  if (method !== null && !['email', 'phone', 'text'].includes(method)) throw new Error('Choose email, phone, text or not set.');
  return mutate(customerId, 'update_contact_preference', { preferredContactMethod: method }, ['preferred_contact_method']);
}
export function saveCustomerProfile(customerId: string, draft: CustomerProfileDraft) {
  return mutate(customerId, 'update_profile', validateProfile(draft), ['first_name', 'last_name', 'phone', 'address_line_1', 'address_line_2', 'city', 'state', 'postal_code']);
}
