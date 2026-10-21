const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/orders-view.ts'), 'utf8').replace(/^import .*$/gm, '') + '\nexport { orderCard };'
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const context = { exports: {}, deliveryEstimateEditor: () => 'DELIVERY_EDITOR' }
vm.runInNewContext(code, context)
const helpers = { escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'), money: value => '$' + value, dateTime: value => value || '—' }
test('pending sandbox order renders historical lines and honest reservation status without delivery controls', () => {
 const html = context.exports.orderCard({ id: '1', status: 'pending', payment_status: 'pending', payment_method: 'sandbox', total: 12, items: [{ product_name: 'Stored name', product_code: 'SKU', quantity: 2, unit_price: 6, line_total: 12 }], customer: null, invoice: null, payment: null }, helpers)
 assert.match(html, /Stored name/); assert.match(html, /2 × \$6/); assert.match(html, /No payment was collected/); assert.doesNotMatch(html, /DELIVERY_EDITOR/)
})
test('order status filter includes pending sandbox orders', () => {
 assert.match(context.exports.ordersPageMarkup('tester', helpers.escapeHtml), /value="pending"/)
})
