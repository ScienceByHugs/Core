export type CoreOrderItem = {
  id: string
  order_id: string
  product_id: string | null
  product_code: string | null
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
  created_at: string
}

export type CoreOrderCustomer = {
  id: string
  customer_number: string | null
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  account_status: string
  preferred_contact_method: string | null
}

export type CoreOrderPayment = {
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

export type CoreOrderInvoice = {
  id: string
  invoice_number: string
  order_id: string
  status: string
  pdf_status: string | null
  pdf_url: string | null
  send_status: string
  sent_at: string | null
  created_at: string
}

export type CoreOrder = {
  id: string
  order_number: string | null
  customer_id: string | null
  status: string
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  total: number
  payment_method: string | null
  payment_status: string
  customer_notes: string | null
  admin_notes: string | null
  contact_method: string | null
  fulfillment_note: string | null
  estimated_delivery_date: string | null
  submitted_at: string | null
  paid_at: string | null
  ordered_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  delayed_at: string | null
  cancelled_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  customer: CoreOrderCustomer | null
  items: CoreOrderItem[]
  payment: CoreOrderPayment | null
  invoice: CoreOrderInvoice | null
}


// Shared display rules preserve historical totals and literal calendar dates.
export const orderMoney = (value: number) => Number(value).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const customerName = (order: CoreOrder) =>
  [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || 'Customer';
export const statusLabel = (value: string) => value.replaceAll('_', ' ');
export function matchesOrder(order: CoreOrder, query: string, status: string) {
  if (status !== 'all' && order.status !== status) return false;
  const q = query.trim().toLowerCase();
  return !q || [order.order_number, customerName(order), order.customer?.customer_number,
    order.customer?.email, order.customer?.phone, order.payment_method,
    order.payment?.payment_reference].filter(Boolean).join(' ').toLowerCase().includes(q);
}
export function validDeliveryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function invoiceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
