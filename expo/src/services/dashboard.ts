import { invokeCore } from './invoke';

// Subset of CoreDashboard in src/services/dashboard.ts (web app) used by the
// native dashboard. Keep field names identical to the core-dashboard response.
export type CoreDashboard = {
  generated_at: string;
  attention: {
    awaiting_invoice_approval: number;
    ready_to_send: number;
    payment_submitted: number;
    delayed_orders: number;
    active_unpaid_orders: number;
    missing_coa: number;
    uncategorized_products: number;
  };
  business: {
    paid_revenue: number;
    paid_orders: number;
    average_paid_order: number;
    customers: number;
    repeat_customers: number;
    revenue_7d: number;
    orders_7d: number;
  };
  operations: {
    recent_orders: Array<{
      id: string;
      order_number: string | null;
      status: string;
      payment_status: string;
      payment_method: string | null;
      total: number;
      created_at: string;
    }>;
  };
};

export const loadDashboard = () => invokeCore<CoreDashboard>('core-dashboard');
