const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
 const source = fs.readFileSync(path.join(__dirname, '../expo/src/services/', file), 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const context = { exports: {}, require: name => imports[name], Error, Date };
 vm.runInNewContext(code, context); return context.exports;
}
const model = load('finance-model.ts');
function fixture() {
 return { success: true, generated_at: '2026-10-25T12:00:00Z', summary: {
 paid_revenue: 19.95, paid_orders: 1, verified_payment_records: 0, verified_payment_total: 0,
 open_order_value: 9.99, sent_unpaid_invoice_value: 9.99, payment_review_value: 0,
 payment_review_count: 0, delivered_paid_orders: 0, unfulfilled_paid_orders: 1 },
 payment_mix: [{ method: 'PayPal', count: 1, amount: 19.95 }], monthly: [{ month: '2026-10', orders: 1, revenue: 19.95 }],
 aging: [{ invoice_id: 'i-1', invoice_number: 'INV-1', customer_id: null, customer_name: 'Customer', total: 9.99, age_days: 2, bucket: '0–30', created_at: '2026-10-23T12:00:00Z' }],
 unpaid_customers: [{ customer_id: 'c-1', name: 'Customer', total: 9.99, count: 1 }], payment_review: [] };
}
test('finance preserves service totals, cents, zero values and overlapping exposure measures without recomputing', () => {
 const data = fixture(); const result = model.validateFinance(data);
 assert.equal(result, data); assert.equal(result.summary.paid_revenue, 19.95);
 assert.equal(result.summary.verified_payment_total, 0);
 assert.equal(result.summary.open_order_value, 9.99); assert.equal(result.summary.sent_unpaid_invoice_value, 9.99);
 const empty = fixture(); for (const key of ['payment_mix','monthly','aging','unpaid_customers','payment_review']) empty[key] = [];
 assert.equal(model.validateFinance(empty).aging.length, 0);
});
test('incomplete, nonfinite and mismatched finance data is rejected instead of displaying false zero totals', () => {
 const changes = [d => delete d.summary, d => delete d.summary.paid_revenue, d => d.summary.paid_revenue = '19.95',
 d => d.summary.paid_revenue = NaN, d => d.monthly[0].revenue = Infinity, d => d.aging[0].age_days = '2',
 d => d.payment_mix = null, d => d.payment_review = [{ id: 'p-1', amount: 10 }], d => d.unpaid_customers[0].name = null,
 d => d.generated_at = 'invalid', d => d.success = false];
 for (const change of changes) { const d = fixture(); change(d); assert.throws(() => model.validateFinance(d), /incomplete/); }
 for (const d of [null, undefined, [], 'bad']) assert.throws(() => model.validateFinance(d), /incomplete/);
});
test('finance loader calls only the existing read endpoint and propagates permission/network failures', async () => {
 const calls = []; const api = load('finance.ts', { './invoke': { invokeCore: async (...args) => { calls.push(args); return fixture(); } }, './finance-model': model });
 assert.equal((await api.loadFinance()).summary.paid_revenue, 19.95); assert.deepEqual(calls, [['core-finance']]);
 const denied = load('finance.ts', { './invoke': { invokeCore: async () => { throw new Error('Administrator access required'); } }, './finance-model': model });
 await assert.rejects(denied.loadFinance(), /Administrator access/);
});
test('invalid/missing report timestamps are shown safely in display helpers', () => {
 assert.equal(model.financeTime(null), '—'); assert.equal(model.financeTime('not-a-date'), '—');
 assert.notEqual(model.financeTime('2026-10-25T12:00:00Z'), '—');
});
