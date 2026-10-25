export type CoreInvoiceItem = {
  order_id: string
  product_id: string | null
  product_code: string | null
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export type CoreOrderSummary = {
  id: string
  order_number: string | null
  status: string
  payment_status: string | null
  payment_method: string | null
  paid_at: string | null
  ordered_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  estimated_delivery_date: string | null
  delayed_at: string | null
  cancelled_at: string | null
  completed_at: string | null
  updated_at: string
}

export type CorePayment = {
  id: string
  order_id: string
  provider: string | null
  payment_reference: string | null
  amount: number
  status: string
  notes: string | null
  submitted_at: string | null
  verified_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export type CoreInvoice = {
  id: string
  invoice_number: string
  order_id: string | null
  customer_id: string
  status: string
  subtotal: number
  shipping_total: number
  discount_total: number
  tax_total: number
  total: number
  payment_method: string | null
  google_sheet_name: string | null
  google_sheet_url: string | null
  pdf_status: string | null
  pdf_url: string | null
  pdf_created_at: string | null
  created_at: string
  contact_method: string | null
  customer_name_snapshot: string | null
  customer_email_snapshot: string | null
  customer_phone_snapshot: string | null
  send_status: string
  sent_at: string | null
  sent_to: string | null
  items: CoreInvoiceItem[]
  order: CoreOrderSummary | null
  payment: CorePayment | null
}


export type PaymentState = 'blocked' | 'waiting' | 'review' | 'paid';
export function paymentState(invoice: CoreInvoice): PaymentState {
  const methods = [invoice.payment_method, invoice.order?.payment_method, invoice.payment?.provider].map(s => s?.toLowerCase());
  if (!invoice.order_id || !invoice.order || invoice.order.id !== invoice.order_id ||
    invoice.order.status === 'cancelled' || invoice.status === 'cancelled' || methods.includes('sandbox') ||
    (invoice.status !== 'direct_checkout' && invoice.send_status !== 'sent')) return 'blocked';
  if (invoice.payment?.status === 'verified' || invoice.order.payment_status === 'paid') return 'paid';
  return invoice.payment?.status === 'submitted' ? 'review' : 'waiting';
}
export function matchesPayment(invoice: CoreInvoice, query: string, filter: string) {
  const state = paymentState(invoice);
  if (filter !== 'all' && state !== filter) return false;
  const q = query.trim().toLowerCase();
  return !q || [invoice.invoice_number, invoice.order?.order_number, invoice.customer_name_snapshot,
    invoice.customer_email_snapshot, invoice.payment?.provider, invoice.payment?.payment_reference]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}
export const testPaymentsEnabled = (value: string | undefined) => value === 'true';
export const paymentProviders = ['Zelle', 'PayPal', 'Venmo'] as const;
export function recordFields(provider: string, reference: string, notes: string) {
  if (!(paymentProviders as readonly string[]).includes(provider)) throw new Error('Choose a payment method.');
  const paymentReference = reference.trim();
  const cleanNotes = notes.trim();
  if (paymentReference.length > 120 || cleanNotes.length > 300) throw new Error('Reference must be 120 characters or fewer; notes 300 or fewer.');
  return { provider, paymentReference, notes: cleanNotes };
}
