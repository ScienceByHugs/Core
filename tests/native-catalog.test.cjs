const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
 const source = fs.readFileSync(path.join(__dirname, '../expo/src/services/', file), 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const context = { exports: {}, require: name => imports[name], Error, URL };
 vm.runInNewContext(code, context); return context.exports;
}
const model = load('catalog-model.ts');
const product = { id: 'p-1', name: 'Sample', sku: 'SKU-1', quantity: 'Package', price: 19.95, description: 'Verified description', image_url: 'https://example.test/image.png', category_id: 'c-1', publication_status: 'draft', inventory: { stock_on_hand: 5, reserved_quantity: 2, available_to_sell: 3, low_stock_threshold: 3 } };
const categories = [{ id: 'c-1', name: 'Category', active: true }];
const verify = { authenticity: true, eligibility: true, imagery: true, evidence: 'Documented source and review references' };

const writeGateOn = { assertRecordEdits: () => {}, recordEditsEnabled: true };
function writeGate(value) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../expo/src/services/write-gate.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Error, process: { env: value === undefined ? {} : { EXPO_PUBLIC_ENABLE_ADMIN_WRITES: value } } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const service = (fn, gate = writeGateOn) => load('catalog.ts', { './invoke': { invokeCore: fn }, './catalog-model': model, './write-gate': gate });
test('product payload preserves cents, permits only editable fields and validates required details/URLs', () => {
 const draft = model.productDraft(product);
 const payload = model.productPayload({ ...draft, source_cost: 0, is_synthetic: false, publication_status: 'published' });
 assert.equal(payload.price, 19.95); assert.equal(payload.source_cost, undefined); assert.equal(payload.publication_status, undefined); assert.equal(payload.is_synthetic, undefined);
 for (const patch of [{ name: 'X' }, { sku: '' }, { price: '0' }, { price: '19.999' }, { price: 'NaN' }, { image_url: 'javascript:alert(1)' }, { image_url: 'https://user:password@example.test/a' }]) assert.throws(() => model.productPayload({ ...draft, ...patch }));
});
test('inventory count requires safe integers, reason and sufficient stock for reservations', () => {
 assert.equal(model.stockPayload('5', '3', ' Counted ', 2).reason, 'Counted');
 for (const args of [['1','3','Counted',2], ['1.5','0','Counted',0], ['-1','0','Counted',0], ['','0','Counted',0], ['2147483648','0','Counted',0], ['1','0','x',0]]) assert.throws(() => model.stockPayload(...args));
});
test('publication requires explicit evidence and checks; synthetic/uncounted/incomplete products cannot publish', () => {
 assert.equal(model.publicationPayload(product, 'published', verify, categories).status, 'published');
 for (const patch of [{ is_synthetic: true }, { sku: '' }, { description: '' }, { price: 0 }, { inventory: null }, { category_id: 'missing' }]) assert.throws(() => model.publicationPayload({ ...product, ...patch }, 'published', verify, categories));
 assert.throws(() => model.publicationPayload(product, 'published', { ...verify, imagery: false }, categories));
 assert.throws(() => model.publicationPayload(product, 'published', { ...verify, evidence: 'Short' }, categories));
 assert.equal(model.publicationPayload({ ...product, is_synthetic: true }, 'review', { ...verify, evidence: '' }, []).status, 'review');
});
test('catalog filters keep unknown, out and low stock distinct and compose category/search', () => {
 assert.equal(model.matchesProduct(product, ' sku-1 ', 'c-1', 'low'), true);
 assert.equal(model.matchesProduct(product, 'sku-1', 'other', 'low'), false);
 const out = { ...product, inventory: { ...product.inventory, available_to_sell: 0 } };
 assert.equal(model.matchesProduct(out, '', '', 'low'), false); assert.equal(model.matchesProduct(out, '', '', 'out'), true);
 assert.equal(model.matchesProduct({ ...product, inventory: null }, '', '', 'unknown'), true);
});
test('categories require constrained name and slug, and catalog reads reject malformed payloads', async () => {
 assert.equal(model.categoryPayload(' Samples ', 'samples', '', true).name, 'Samples');
 assert.throws(() => model.categoryPayload('X', 'BAD SLUG', '', true));
 await assert.rejects(service(async () => ({ success: true, products: [] })).loadCatalog(), /load catalog/);
 await assert.rejects(service(async () => ({ success: true })).loadProductHistory('p-1'), /history/);
});
test('catalog writes use explicit existing actions, disable retries and require matching server records', async () => {
 const calls = [];
 const api = service(async (...args) => { calls.push(args); return { success: true, product, category: categories[0] }; });
 await api.saveProduct(model.productDraft(product), product.id);
 await api.adjustStock(product, '5', '3', 'Counted');
 await api.savePublication(product, 'review', verify, categories);
 await api.saveCategory('Category', 'category', '', true, 'c-1');
 const normalized = JSON.parse(JSON.stringify(calls));
 assert.deepEqual(normalized.map(c => c[1].action), ['save_product', 'adjust_inventory', 'set_publication', 'save_category']);
 for (const call of normalized) { assert.equal(call[0], 'core-catalog-control'); assert.deepEqual(call[2], { retry: false }); }
 assert.equal(normalized[1][1].stockOnHand, 5); assert.equal(normalized[1][1].productId, 'p-1');
 await assert.rejects(service(async () => ({ success: true, product: { id: 'wrong' } })).saveProduct(model.productDraft(product), 'p-1'), /confirm/);
 await assert.rejects(service(async () => { throw new Error('Stock is below reservations'); }).adjustStock(product, '5', '3', 'Counted'), /below reservations/);
});

test('catalog product, stock, publication and category writes are blocked while the switch is off; reads still work', async () => {
  const calls = [];
  const off = service(async (...args) => { calls.push(args[1]?.action ?? args[0]); return { success: true, products: [], categories: [], events: [], product, category: categories[0] }; }, writeGate(undefined));
  await assert.rejects(off.saveProduct(model.productDraft(product), product.id), /Editing is off/);
  await assert.rejects(off.adjustStock(product, '5', '3', 'Counted'), /Editing is off/);
  await assert.rejects(off.savePublication(product, 'review', verify, categories), /Editing is off/);
  await assert.rejects(off.saveCategory('Category', 'category', '', true, 'c-1'), /Editing is off/);
  assert.deepEqual(calls, []);
  await off.loadCatalog();
  await off.loadProductHistory(product.id);
  assert.deepEqual(calls, ['core-catalog', 'history']);
});
