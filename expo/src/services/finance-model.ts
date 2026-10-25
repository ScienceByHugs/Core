export type CoreFinancePayload = {
  generated_at: string
  summary: {
    paid_revenue: number
    paid_orders: number
    verified_payment_records: number
    verified_payment_total: number
    open_order_value: number
    sent_unpaid_invoice_value: number
    payment_review_value: number
    payment_review_count: number
    delivered_paid_orders: number
    unfulfilled_paid_orders: number
  }
  payment_mix: Array<{ method: string; count: number; amount: number }>
  monthly: Array<{ month: string; orders: number; revenue: number }>
  aging: Array<{
    invoice_id: string
    invoice_number: string
    customer_id: string | null
    customer_name: string
    total: number
    age_days: number
    bucket: string
    created_at: string
  }>
  unpaid_customers: Array<{ customer_id: string; name: string; total: number; count: number }>
  payment_review: Array<{
    id: string
    order_id: string
    provider: string | null
    amount: number
    submitted_at: string
    customer_name: string
  }>
}


export function validateFinance(value: unknown): CoreFinancePayload {
  const bad = () => { throw new Error('The finance response is incomplete. Refresh or check the staging service.'); };
  if (!value || typeof value !== 'object') return bad();
  const data = value as Record<string, unknown>;
  if (data.success !== true || typeof data.generated_at !== 'string' || !Number.isFinite(Date.parse(data.generated_at))) return bad();
  if (!data.summary || typeof data.summary !== 'object') return bad();
  const summary = data.summary as Record<string, unknown>;
  for (const key of ['paid_revenue', 'paid_orders', 'verified_payment_records', 'verified_payment_total', 'open_order_value', 'sent_unpaid_invoice_value', 'payment_review_value', 'payment_review_count', 'delivered_paid_orders', 'unfulfilled_paid_orders']) {
    if (typeof summary[key] !== 'number' || !Number.isFinite(summary[key])) return bad();
  }
  const shapes: Record<string, { strings: string[]; numbers: string[] }> = {
    payment_mix: { strings: ['method'], numbers: ['count', 'amount'] },
    monthly: { strings: ['month'], numbers: ['orders', 'revenue'] },
    aging: { strings: ['invoice_id', 'invoice_number', 'customer_name', 'bucket'], numbers: ['total', 'age_days'] },
    unpaid_customers: { strings: ['customer_id', 'name'], numbers: ['total', 'count'] },
    payment_review: { strings: ['id', 'order_id', 'customer_name'], numbers: ['amount'] },
  };
  for (const [key, shape] of Object.entries(shapes)) {
    const rows = data[key];
    if (!Array.isArray(rows)) return bad();
    for (const row of rows) {
      if (!row || typeof row !== 'object') return bad();
      if (shape.strings.some(field => typeof row[field] !== 'string') || shape.numbers.some(field => typeof row[field] !== 'number' || !Number.isFinite(row[field]))) return bad();
    }
  }
  return value as CoreFinancePayload;
}
export function financeTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}
