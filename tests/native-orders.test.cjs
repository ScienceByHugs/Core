const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../expo/src/services/', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => imports[name], URL, Date, Error };
  vm.runInNewContext(code, context);
  return context.exports;
}
const model = load('order-model.ts');
const order = {
  id: 'order-1', order_number: 'SBH-42', status: 'delayed', payment_method: 'zelle',
  customer: { first_name: 'Ada', last_name: 'Lovelace', customer_number: 'C-12', email: 'ada@example.test', phone: '555-0100' },
  payment: { payment_reference: 'Ref-905' },
};
test('native orders search composes with status and finds customer/contact/payment references', () => {
  for (const query of [' sbh-42 ', 'ADA LOVELACE', 'c-12', 'ada@example', '555-0100', 'zelle', 'ref-905']) {
    assert.equal(model.matchesOrder(order, query, 'delayed'), true, query);
    assert.equal(model.matchesOrder(order, query, 'shipped'), false, query);
  }
  assert.equal(model.matchesOrder(order, '', 'all'), true);
  assert.equal(model.matchesOrder(order, 'missing', 'all'), false);
  assert.equal(model.matchesOrder({ ...order, customer: null, payment: null }, 'customer', 'all'), true);
});
test('historical money keeps cents and delivery dates reject rollover, zero year and timestamps', () => {
  assert.equal(model.orderMoney(19.95), '$19.95');
  assert.equal(model.orderMoney(0), '$0.00');
  assert.equal(model.validDeliveryDate('2028-02-29'), true);
  for (const date of ['', '0000-01-01', '2026-02-29', '2026-04-31', '2026-1-01', '2026-01-01T00:00:00Z']) assert.equal(model.validDeliveryDate(date), false, date);
});
test('invoice links reject executable/local schemes and embedded credentials', () => {
  assert.equal(model.invoiceUrl('https://example.test/invoice.pdf?token=abc'), 'https://example.test/invoice.pdf?token=abc');
  for (const url of [null, '', 'javascript:alert(1)', 'file:///invoice.pdf', 'http://example.test/a', 'https://user:password@example.test/a', 'not a url']) assert.equal(model.invoiceUrl(url), null);
});
function service(invokeCore) { return load('orders.ts', { './invoke': { invokeCore }, './order-model': model }); }
test('order read uses the existing endpoint and rejects malformed success responses', async () => {
  const calls = [];
  const api = service(async (...args) => { calls.push(args); return { success: true, orders: [order] }; });
  assert.equal((await api.loadOrders())[0].id, order.id);
  assert.deepEqual(calls, [['core-orders']]);
  for (const response of [{ success: true }, { success: true, orders: {} }, { success: false, orders: [] }]) {
    await assert.rejects(service(async () => response).loadOrders(), /Could not load orders/);
  }
});
test('delivery estimate uses explicit save/clear payload and only accepts matching server confirmation', async () => {
  const calls = [];
  const api = service(async (name, body) => { calls.push([name, body]); return { success: true, order: { id: body.orderId, estimated_delivery_date: body.estimatedDeliveryDate, updated_at: 'server-time' } }; });
  assert.equal((await api.saveDeliveryEstimate(order.id, '2026-10-30')).estimated_delivery_date, '2026-10-30');
  assert.equal((await api.saveDeliveryEstimate(order.id, null)).estimated_delivery_date, null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['core-orders', { action: 'set_delivery_estimate', orderId: order.id, estimatedDeliveryDate: '2026-10-30' }],
    ['core-orders', { action: 'set_delivery_estimate', orderId: order.id, estimatedDeliveryDate: null }],
  ]);
  await assert.rejects(api.saveDeliveryEstimate(order.id, '2026-02-30'), /valid date/);
  assert.equal(calls.length, 2);
  await assert.rejects(service(async () => ({ success: true, order: { id: 'wrong' } })).saveDeliveryEstimate(order.id, null), /confirm/);
});
test('permission and server failures propagate rather than becoming empty orders or saved dates', async () => {
  const api = service(async () => { throw new Error('core. administrator access is required.'); });
  await assert.rejects(api.loadOrders(), /administrator/);
  await assert.rejects(api.saveDeliveryEstimate(order.id, null), /administrator/);
});
