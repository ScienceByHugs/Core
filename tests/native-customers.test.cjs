const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, extra = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../expo/src/services/', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => imports[name], Error, Response, setTimeout, ...extra };
  vm.runInNewContext(code, context); return context.exports;
}
const model = load('customer-model.ts');
const customer = { id: 'c-1', first_name: 'Ada', last_name: 'Lovelace', customer_number: 'C-22', email: 'ada@example.test', phone: '555-0100', referral_code: 'ADA5', membership: { slug: 'principal', name: 'Principal Scientist' } };
function service(invokeCore) { return load('customers.ts', { './invoke': { invokeCore }, './customer-model': model }); }
test('customer search combines membership with name, number, contact and referral search', () => {
  for (const query of [' ADA LOVELACE ', 'c-22', 'ada@example', '555-0100', 'ada5', 'scientist']) {
    assert.equal(model.matchesCustomer(customer, query, 'principal'), true, query);
    assert.equal(model.matchesCustomer(customer, query, 'other'), false, query);
  }
  assert.equal(model.matchesCustomer(customer, 'missing', 'all'), false);
  assert.equal(model.matchesCustomer({ ...customer, first_name: null, last_name: null, membership: null }, 'customer', 'all'), true);
});
test('profile draft handles missing fields, trims values, enforces limits and excludes extra fields', () => {
  const draft = model.profileDraft(customer);
  assert.equal(draft.addressLine1, '');
  const clean = model.validateProfile({ ...draft, firstName: ' Ada ', role: 'owner', email: 'replacement@example.test' });
  assert.equal(clean.firstName, 'Ada'); assert.equal(clean.role, undefined); assert.equal(clean.email, undefined);
  assert.throws(() => model.validateProfile({ ...draft, phone: '1'.repeat(41) }), /Phone/);
});
test('customer workspace rejects malformed responses and propagates access errors', async () => {
  const calls = [];
  const api = service(async (...args) => { calls.push(args); return { success: true, customers: [customer], memberships: [] }; });
  assert.equal((await api.loadCustomers()).customers[0].id, customer.id);
  assert.deepEqual(calls, [['core-customers']]);
  for (const response of [{ success: true, customers: [] }, { success: false, customers: [], memberships: [] }]) await assert.rejects(service(async () => response).loadCustomers(), /Could not load/);
  await assert.rejects(service(async () => { throw new Error('Access denied'); }).loadCustomers(), /Access denied/);
});
test('customer mutations send only their explicit action and disable automatic retries', async () => {
  const calls = [];
  const api = service(async (...args) => {
    calls.push(args); const b = args[1];
    return { success: true, customer: { id: b.customerId, notes: b.notes ?? null, preferred_contact_method: b.preferredContactMethod ?? null, updated_at: 'server' } };
  });
  assert.equal((await api.saveCustomerNotes(customer.id, 'note')).notes, 'note');
  assert.equal((await api.saveContactPreference(customer.id, null)).preferred_contact_method, null);
  const normalized = JSON.parse(JSON.stringify(calls));
  assert.deepEqual(normalized, [
    ['core-customer-control', { action: 'update_notes', customerId: customer.id, notes: 'note' }, { retry: false }],
    ['core-customer-control', { action: 'update_contact_preference', customerId: customer.id, preferredContactMethod: null }, { retry: false }],
  ]);
  assert.throws(() => api.saveCustomerNotes(customer.id, 'x'.repeat(2001)), /2000/);
  assert.throws(() => api.saveContactPreference(customer.id, 'unknown'), /Choose/);
  assert.equal(calls.length, 2);
});
test('customer saves require server confirmation for the same customer and expected fields', async () => {
  for (const response of [{ success: false }, { success: true, customer: { id: 'other', notes: 'note' } }, { success: true, customer: { id: customer.id } }]) {
    await assert.rejects(service(async () => response).saveCustomerNotes(customer.id, 'note'), /confirm/);
  }
  const draft = model.profileDraft(customer);
  const api = service(async (name, body) => ({ success: true, customer: { id: body.customerId, first_name: body.firstName, last_name: body.lastName, phone: body.phone, address_line_1: body.addressLine1, address_line_2: body.addressLine2, city: body.city, state: body.state, postal_code: body.postalCode } }));
  assert.equal((await api.saveCustomerProfile(customer.id, { ...draft, firstName: ' Ada ' })).first_name, 'Ada');
});
test('function adapter makes one network attempt for audited writes while retaining read retries', async () => {
  let calls = 0;
  const supabase = { functions: { invoke: async () => { calls++; return { data: null, error: { name: 'FunctionsFetchError' } }; } } };
  const api = load('invoke.ts', { '@/lib/supabase': { supabase } }, { setTimeout: fn => { fn(); } });
  await assert.rejects(api.invokeCore('core-customer-control', {}, { retry: false }), /reach the server/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(api.invokeCore('core-customers'), /reach the server/);
  assert.equal(calls, 3);
});
