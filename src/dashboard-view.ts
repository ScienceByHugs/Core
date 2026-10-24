import { loadCoreDashboard } from './services/dashboard'

type Helpers = {
  escapeHtml: (value: unknown) => string
  money: (value: number | string | null | undefined) => string
  dateTime: (value: string | null | undefined) => string
}

export function dashboardPageMarkup(email: string, escapeHtml: Helpers['escapeHtml']) {
  return '<section class="core-dashboard-shell">' +
    '<section class="core-hero">' +
      '<div class="core-hero-copy">' +
        '<span class="core-hero-kicker">SCIENCE BY HUGS</span>' +
        '<h1>core.</h1>' +
        '<p>OPERATIONS <i>•</i> FINANCE <i>•</i> FULFILLMENT</p>' +
        '<small>Signed in as <strong>' + escapeHtml(email) + '</strong></small>' +
      '</div>' +
      '<div class="core-hero-orbit" aria-hidden="true"><span></span><i></i></div>' +
      '<div class="core-live-card"><span><i></i> SYSTEM ONLINE</span><strong>core 2.0</strong><small>Live</small></div>' +
    '</section>' +
    '<section id="executive-dashboard"><div class="loading">Loading command center…</div></section>' +
  '</section>'
}

const icon = (symbol: string) => '<span class="core-kpi-icon" aria-hidden="true">' + symbol + '</span>'

export async function bindDashboardPage(helpers: Helpers) {
  const root = document.querySelector<HTMLDivElement>('#executive-dashboard')
  if (!root) return

  try {
    const data = await loadCoreDashboard()
    const { attention, business, operations, customers, catalog } = data
    const unfulfilled = Object.entries(operations.fulfillment)
      .filter(([status]) => !['delivered', 'cancelled'].includes(status.toLowerCase()))
      .reduce((sum, [, count]) => sum + count, 0)

    const recentOrders = operations.recent_orders.length
      ? operations.recent_orders.slice(0, 6).map(order =>
          '<a class="core-order-row" href="#orders">' +
            '<span><strong>' + helpers.escapeHtml(order.order_number || 'Order') + '</strong>' +
            '<small>' + helpers.escapeHtml(order.payment_method || 'Payment') + '</small></span>' +
            '<strong>' + helpers.money(order.total) + '</strong>' +
            '<span class="core-row-status ' + helpers.escapeHtml(order.payment_status === 'paid' ? 'paid' : 'open') + '">' +
              helpers.escapeHtml(order.payment_status === 'paid' ? 'Paid' : order.payment_status.replaceAll('_', ' ')) +
            '</span>' +
            '<time>' + helpers.escapeHtml(new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '</time>' +
          '</a>',
        ).join('')
      : '<div class="core-empty-line">No recent orders.</div>'

    const fulfillmentOpen = unfulfilled
    const pendingPayments = attention.payment_submitted
    const pendingInvoices = attention.awaiting_invoice_approval + attention.ready_to_send
    const catalogIssues = attention.missing_coa + attention.uncategorized_products

    const systemRow = (label: string, value: string | number, href: string, healthy = true) =>
      '<a class="core-health-row" href="' + href + '">' +
        '<span><b>' + label + '</b><small>' + value + '</small></span>' +
        '<strong class="' + (healthy ? 'healthy' : 'warning') + '">' + (healthy ? 'Healthy' : 'Review') + '</strong>' +
      '</a>'

    root.innerHTML =
      '<section class="core-kpi-grid">' +
        '<article class="core-kpi-card">' + icon('$') + '<span>Total Revenue</span><strong>' +
          helpers.money(business.paid_revenue) + '</strong><small>' + business.paid_orders + ' paid orders</small></article>' +
        '<article class="core-kpi-card">' + icon('▱') + '<span>Total Orders</span><strong>' +
          business.paid_orders + '</strong><small>' + business.orders_30d + ' in last 30 days</small></article>' +
        '<article class="core-kpi-card">' + icon('◎') + '<span>Customers</span><strong>' +
          business.customers + '</strong><small>' + business.active_customers + ' active</small></article>' +
        '<article class="core-kpi-card">' + icon('▤') + '<span>Pending Payments</span><strong>' +
          pendingPayments + '</strong><small>' + (pendingPayments ? 'Needs review' : 'No pending') + '</small></article>' +
        '<article class="core-kpi-card">' + icon('◇') + '<span>Unfulfilled Orders</span><strong>' +
          fulfillmentOpen + '</strong><small>' + (fulfillmentOpen ? 'In progress' : 'All caught up') + '</small></article>' +
      '</section>' +

      '<section class="core-quick-section">' +
        '<div class="core-section-heading"><h2>Quick Actions</h2></div>' +
        '<div class="core-quick-grid">' +
          '<a href="#operations">' + icon('▤') + '<span>Create / Approve Invoice</span></a>' +
          '<a href="#orders">' + icon('▱') + '<span>View Orders</span></a>' +
          '<a href="#finance">' + icon('$') + '<span>Verify Payments</span></a>' +
          '<a href="#catalog">' + icon('◇') + '<span>Manage Catalog</span></a>' +
          '<a href="#customers">' + icon('◎') + '<span>View Customers</span></a>' +
        '</div>' +
      '</section>' +

      '<div class="core-dashboard-columns">' +
        '<section class="core-dashboard-panel core-recent-panel">' +
          '<div class="core-section-heading"><h2>Recent Orders</h2><a href="#orders">View All →</a></div>' +
          '<div class="core-order-table-head"><span>Order</span><span>Amount</span><span>Status</span><span>Date</span></div>' +
          '<div class="core-order-table">' + recentOrders + '</div>' +
        '</section>' +

        '<section class="core-dashboard-panel">' +
          '<div class="core-section-heading"><h2>System Status</h2><a href="#notifications">View All →</a></div>' +
          '<div class="core-health-list">' +
            systemRow('Orders', business.paid_orders, '#orders', true) +
            systemRow('Payments', pendingPayments + ' pending', '#finance', pendingPayments === 0) +
            systemRow('Fulfillment', fulfillmentOpen + ' active', '#operations', attention.delayed_orders === 0) +
            systemRow('Invoices', pendingInvoices + ' pending', '#operations', pendingInvoices === 0) +
            systemRow('Catalog', catalog.active + ' active', '#catalog', catalogIssues === 0) +
          '</div>' +
        '</section>' +
      '</div>' +

      '<section class="core-bottom-insights">' +
        '<article><span>30-Day Revenue</span><strong>' + helpers.money(business.revenue_30d) +
          '</strong><small>' + business.orders_30d + ' orders</small></article>' +
        '<article><span>Average Paid Order</span><strong>' + helpers.money(business.average_paid_order) +
          '</strong><small>Across all paid orders</small></article>' +
        '<article><span>Repeat Customers</span><strong>' + business.repeat_customers +
          '</strong><small>' + business.new_customers_30d + ' new / 30d</small></article>' +
        '<article><span>Catalog Coverage</span><strong>' + catalog.with_coa + '/' + catalog.total +
          '</strong><small>COA coverage</small></article>' +
      '</section>' +

      '<p class="dashboard-generated">Updated ' + helpers.escapeHtml(helpers.dateTime(data.generated_at)) + '</p>'
  } catch (error) {
    root.innerHTML = '<div class="empty-state error-state"><h2>Could not load dashboard.</h2><p>' +
      helpers.escapeHtml(error instanceof Error ? error.message : 'Unknown error') + '</p><button class="primary" id="retry-dashboard" type="button">Try again</button></div>'
    root.querySelector('#retry-dashboard')?.addEventListener('click',()=>{root.innerHTML='<div class="loading">Loading command center…</div>';void bindDashboardPage(helpers)})
  }
}
