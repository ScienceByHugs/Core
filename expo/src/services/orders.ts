import { invokeCore } from './invoke';
import { validDeliveryDate, type CoreOrder } from './order-model';
export async function loadOrders(): Promise<CoreOrder[]> {
  const data = await invokeCore<{ success: boolean; orders: CoreOrder[] }>('core-orders');
  if (data.success !== true || !Array.isArray(data.orders)) throw new Error('Could not load orders. Try again.');
  return data.orders;
}
export async function saveDeliveryEstimate(orderId: string, date: string | null) {
  if (date !== null && !validDeliveryDate(date)) throw new Error('Enter a valid date as YYYY-MM-DD.');
  const data = await invokeCore<{ success: boolean; order: Pick<CoreOrder, 'id' | 'estimated_delivery_date' | 'updated_at'> }>(
    'core-orders', { action: 'set_delivery_estimate', orderId, estimatedDeliveryDate: date },
  );
  if (data.success !== true || data.order?.id !== orderId) throw new Error('Could not confirm the saved estimate. Refresh orders before retrying.');
  return data.order;
}
