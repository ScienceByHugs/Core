const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, env = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../expo/src/services/', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: name => imports[name], process: { env }, Error };
  vm.runInNewContext(code, context); return context.exports;
}
const model = load('payment-model.ts');
const invoice = { id: 'i-1', invoice_number: 'INV-22', order_id: 'o-1', status: 'sent', send_status: 'sent', total: 19.95,
  customer_name_snapshot: 'Ada Lovelace', customer_email_snapshot: 'ada@example.test', payment_method: 'Zelle',
  order: { id: 'o-1', order_number: 'SBH-42', status: 'pending', payment_status: 'unpaid', payment_method: 'Zelle' }, payment: null };
const service = (invokeCore, flag) => load('payments.ts', { './invoke': { invokeCore }, './payment-model': model }, { EXPO_PUBLIC_ENABLE_TEST_PAYMENTS: flag });
test('payment state distinguishes submitted from paid and excludes unsafe/ineligible orders', () => {
  assert.equal(model.paymentState(invoice), 'waiting');
  assert.equal(model.paymentState({ ...invoice, payment: { status: 'submitted' } }), 'review');
  assert.equal(model.paymentState({ ...invoice, payment: { status: 'verified' } }), 'paid');
  assert.equal(model.paymentState({ ...invoice, order: { ...invoice.order, payment_status: 'paid' } }), 'paid');
  for (const changed of [ { order_id: null }, { order: null }, { order: { ...invoice.order, id: 'wrong' } },
    { order: { ...invoice.order, status: 'cancelled' } }, { payment_method: 'sandbox' }, { payment: { provider: 'SANDBOX' } }, { send_status: 'pending' } ]) {
    assert.equal(model.paymentState({ ...invoice, ...changed }), 'blocked', JSON.stringify(changed));
  }
  assert.equal(model.paymentState({ ...invoice, status: 'direct_checkout', send_status: 'pending' }), 'waiting');
});
test('payment filters combine state with invoice/order/customer/reference search', () => {
  for (const query of [' inv-22 ', 'sbh-42', 'ADA LOVELACE', 'ada@example', 'ref-9']) {
    const record = { ...invoice, payment: { status: 'submitted', payment_reference: 'ref-9' } };
    assert.equal(model.matchesPayment(record, query, 'review'), true);
    assert.equal(model.matchesPayment(record, query, 'paid'), false);
  }
});
test('test actions default off and cannot invoke the endpoint without exact opt-in', async () => {
  let calls = 0;
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    const api = service(async () => { calls++; }, flag);
    assert.equal(api.enabledTestPayments, false);
    await assert.rejects(api.recordTestPayment(invoice, 'Zelle', '', ''), /disabled/);
    await assert.rejects(api.verifyTestPayment({ ...invoice, payment: { status: 'submitted' } }), /disabled/);
  }
  assert.equal(calls, 0);
});
test('record/verify use separate explicit commands with retries disabled and reject wrong states', async () => {
  const calls = [];
  const api = service(async (...args) => { calls.push(args); return { success: true }; }, 'true');
  await api.recordTestPayment(invoice, 'PayPal', ' ref ', ' note ');
  await api.verifyTestPayment({ ...invoice, payment: { status: 'submitted' } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['core-payment-control', { action: 'record', orderId: 'o-1', provider: 'PayPal', paymentReference: 'ref', notes: 'note' }, { retry: false }],
    ['core-payment-control', { action: 'verify', orderId: 'o-1' }, { retry: false }],
  ]);
  await assert.rejects(api.verifyTestPayment(invoice), /state changed/);
  await assert.rejects(api.recordTestPayment({ ...invoice, payment_method: 'sandbox' }, 'Zelle', '', ''), /state changed/);
  await assert.rejects(api.recordTestPayment(invoice, 'Unknown', '', ''), /Choose/);
  await assert.rejects(api.recordTestPayment(invoice, 'Zelle', 'x'.repeat(121), ''), /120/);
  assert.equal(calls.length, 2);
});
test('payment read validates results; rejected or ambiguous writes are not advertised as successful', async () => {
  assert.equal((await service(async () => ({ success: true, invoices: [invoice] })).loadPayments())[0].id, invoice.id);
  await assert.rejects(service(async () => ({ success: true })).loadPayments(), /load payments/);
  for (const result of [{}, { success: false }]) await assert.rejects(service(async () => result, 'true').recordTestPayment(invoice, 'Zelle', '', ''), /confirm/);
  await assert.rejects(service(async () => { throw new Error('Network unavailable'); }, 'true').recordTestPayment(invoice, 'Zelle', '', ''), /Network unavailable/);
});
