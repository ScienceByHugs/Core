import { invokeCore } from './invoke';
import { paymentState, recordFields, testPaymentsEnabled, type CoreInvoice } from './payment-model';
export const enabledTestPayments = testPaymentsEnabled(process.env.EXPO_PUBLIC_ENABLE_TEST_PAYMENTS);
export async function loadPayments(): Promise<CoreInvoice[]> {
  const data = await invokeCore<{ success: boolean; invoices: CoreInvoice[] }>('core-invoices');
  if (data.success !== true || !Array.isArray(data.invoices)) throw new Error('Could not load payments. Try again.');
  return data.invoices;
}
function assertEnabled(invoice: CoreInvoice, expected: 'waiting' | 'review') {
  if (!enabledTestPayments) throw new Error('Test payment actions are disabled.');
  if (paymentState(invoice) !== expected) throw new Error('Payment state changed. Refresh before continuing.');
}
async function command(body: Record<string, unknown>) {
  // Never retry payment writes automatically, including ambiguous network failures.
  const data = await invokeCore<{ success: boolean }>('core-payment-control', body, { retry: false });
  if (data.success !== true) throw new Error('Could not confirm the payment update. Refresh before retrying.');
}
export async function recordTestPayment(invoice: CoreInvoice, provider: string, reference: string, notes: string) {
  assertEnabled(invoice, 'waiting');
  await command({ action: 'record', orderId: invoice.order_id, ...recordFields(provider, reference, notes) });
}
export async function verifyTestPayment(invoice: CoreInvoice) {
  assertEnabled(invoice, 'review');
  await command({ action: 'verify', orderId: invoice.order_id });
}
