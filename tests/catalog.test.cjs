const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function setup(response) {
 const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/catalog.ts'), 'utf8').replace(/^import .*$/gm, '')
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
 const calls = []; const context = { exports: {}, Error, supabase: { functions: { invoke: async (...args) => { calls.push(args); return response } } } }
 vm.runInNewContext(code, context); return { ...context.exports, calls }
}
test('catalog mutations go through authenticated function with product ID and explicit action', async () => {
 const api = setup({ data: { success: true, inventory: { stock_on_hand: 6 } }, error: null })
 const result = await api.catalogCommand('adjust_inventory', { productId: 'test-id', stockOnHand: 6, reason: 'Physical count' })
 assert.equal(result.inventory.stock_on_hand, 6)
 assert.deepEqual(JSON.parse(JSON.stringify(api.calls)), [['core-catalog-control', { body: { action: 'adjust_inventory', productId: 'test-id', stockOnHand: 6, reason: 'Physical count' } }]])
})
test('publication eligibility failure is surfaced rather than reported as saved', async () => {
 const api = setup({ data: { success: false, error: 'Eligibility evidence is required' }, error: null })
 await assert.rejects(api.catalogCommand('set_publication', { status: 'published' }), /Eligibility evidence/)
})
test('server validation response survives Supabase non-2xx wrapper', async () => {
 const api = setup({ data: null, error: { message: 'non-2xx', context: { clone: () => ({ json: async () => ({ error: 'Stock is below reserved quantity' }) }) } } })
 await assert.rejects(api.catalogCommand('adjust_inventory'), /below reserved/)
})
test('unreadable error response retains original failure', async () => {
 const error = new Error('Network unavailable'); error.context = { clone: () => ({ json: async () => { throw new Error('not JSON') } }) }
 await assert.rejects(setup({ data: null, error }).catalogCommand('save_product'), /Network unavailable/)
})
