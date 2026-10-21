import { catalogCommand, loadCoreCatalog, type CoreCatalogCategory, type ManagedProduct } from './services/catalog'
import './catalog-management.css'

type Helpers = { escapeHtml: (value: unknown) => string; money: (value: number | string | null | undefined) => string; dateTime: (value: string | null | undefined) => string }
const state = { search: '', category: '', status: '' }

export function catalogPageMarkup(email: string, escapeHtml: Helpers['escapeHtml']) {
  return `<section class="dashboard-head dashboard-head-compact catalog-page-head"><div><span class="eyebrow">PRODUCT OPERATIONS</span><h1 class="dashboard-title">Catalog & inventory</h1><p class="copy">Manage product information, verified publication and auditable stock.</p></div><div class="operator">Signed in as <strong>${escapeHtml(email)}</strong></div></section>
  <div class="catalog-management"><div class="catalog-management-actions"><button id="catalog-create" class="primary" type="button">Create draft product</button><button id="catalog-category-create" class="secondary" type="button">Manage categories</button><button id="catalog-refresh" class="secondary" type="button">Refresh</button></div>
  <p class="catalog-notice">Staging operations. Drafts and unverified products stay unpublished. Package size is separate from stock. Each sellable variant requires its own SKU.</p><p id="catalog-message" role="status" aria-live="polite"></p>
  <section id="catalog-editor-panel"></section><section class="catalog-metrics" id="catalog-metrics"></section>
  <section class="catalog-toolbar"><label class="queue-search"><span class="sr-only">Search products</span><input id="catalog-search" type="search" placeholder="Search name or SKU"></label><select id="catalog-category" aria-label="Category"><option value="">All categories</option></select><select id="catalog-state" aria-label="Publication or inventory status"><option value="">All states</option><option>draft</option><option>review</option><option>published</option><option>archived</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="unknown">Unknown stock</option></select></section><p id="catalog-summary" aria-live="polite"></p><section class="catalog-list" id="catalog-list"><p role="status">Loading catalog…</p></section></div>`
}

export async function bindCatalogPage(h: Helpers) {
  const candidate = document.querySelector<HTMLElement>('.catalog-management')
  if (!candidate) return
  const root: HTMLElement = candidate
  const el = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const e = h.escapeHtml
  const message = el('#catalog-message')
  const panel = el('#catalog-editor-panel')
  let products: ManagedProduct[] = []
  let categories: CoreCatalogCategory[] = []
  const categoryOptions = (id: string | null = '') => '<option value="">Choose category</option>' + categories.map(c => `<option value="${e(c.id)}" ${c.id === id ? 'selected' : ''}>${e(c.name)}${c.active ? '' : ' (inactive)'}</option>`).join('')
  const input = (label: string, name: string, value: unknown = '', attrs = '') => `<label><span>${label}</span><input name="${name}" value="${e(value ?? '')}" ${attrs}></label>`
  const run = async (button: HTMLButtonElement, action: string, body: Record<string, unknown>, success: string) => {
    button.disabled = true
    message.textContent = 'Saving…'
    try { const result = await catalogCommand(action, body); try { await refresh(); message.textContent = success } catch { message.textContent = success + ' Catalog refresh failed; use Refresh to reload the saved state.' } return result }
    catch (error) { message.textContent = error instanceof Error ? error.message : 'Unable to save. Please try again.'; return null }
    finally { button.disabled = false; message.scrollIntoView({ block: 'nearest' }) }
  }
  function edit(product?: ManagedProduct) {
    message.textContent = ''
    panel.innerHTML = `<form class="catalog-admin-form"><h2>${product ? 'Edit product' : 'Create draft product'}</h2><p>Saving information returns this item to draft and clears verification. Publication requires a separate review.</p><div class="catalog-editor-grid">
    ${input('Product name', 'name', product?.name, 'required maxlength="200"')}${input('Unique SKU / variant SKU', 'sku', product?.sku, 'required maxlength="120"')}
    <label><span>Category</span><select name="category_id">${categoryOptions(product?.category_id)}</select></label>${input('Selling price (USD)', 'price', product?.price, 'type="number" required min="0.01" step="0.01"')}
    ${input('Variant / package size (not stock)', 'quantity', product?.quantity, 'maxlength="120"')}${input('Authorized image URL', 'image_url', product?.image_url, 'type="url" maxlength="2000" placeholder="https://…"')}
    <label class="catalog-span-2"><span>Description</span><textarea name="description" rows="4" maxlength="5000">${e(product?.description || '')}</textarea></label><label class="catalog-check"><input name="featured" type="checkbox" ${product?.featured ? 'checked' : ''}> Featured after publication</label></div><div class="catalog-management-actions"><button type="submit" class="primary">Save draft</button><button type="button" data-close class="secondary">Cancel</button></div></form>`
    const form = panel.querySelector('form')!
    form.onsubmit = async event => {
      event.preventDefault()
      const data = new FormData(form)
      const productData = Object.fromEntries(data)
      const result = await run(form.querySelector('button')!, 'save_product', { ...(product ? { productId: product.id } : {}), product: { ...productData, category_id: data.get('category_id') || null, price: Number(data.get('price')), featured: data.has('featured') } }, 'Draft saved. Review information, stock and eligibility before publication.')
      if (result) panel.innerHTML = ''
    }
    panel.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { panel.innerHTML = '' }
    panel.querySelector<HTMLInputElement>('input')?.focus()
    panel.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  function inventory(product: ManagedProduct) {
    message.textContent = ''
    const stock = product.inventory
    panel.innerHTML = `<form class="catalog-admin-form"><h2>Inventory · ${e(product.name)}</h2><p>Reserved: ${stock?.reserved_quantity ?? 0}. Available to sell: ${stock?.available_to_sell ?? 'unknown'}. Stock cannot be reduced below reservations.</p><div class="catalog-editor-grid">${input('Physical units on hand', 'stockOnHand', stock?.stock_on_hand, 'type="number" min="0" step="1" required')}${input('Low-stock threshold', 'lowStockThreshold', stock?.low_stock_threshold ?? 0, 'type="number" min="0" step="1" required')}${input('Reason for adjustment', 'reason', '', 'required minlength="3" maxlength="500"')}</div><div class="catalog-management-actions"><button class="primary">Record adjustment</button><button type="button" data-close class="secondary">Cancel</button></div></form>`
    const form = panel.querySelector('form')!
    form.onsubmit = async event => { event.preventDefault(); const data = new FormData(form); if (await run(form.querySelector('button')!, 'adjust_inventory', { productId: product.id, stockOnHand: Number(data.get('stockOnHand')), lowStockThreshold: Number(data.get('lowStockThreshold')), reason: data.get('reason') }, 'Inventory adjustment saved. Availability refreshed.')) panel.innerHTML = '' }
    panel.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { panel.innerHTML = '' }
    panel.scrollIntoView({ block: 'start' })
  }
  function publication(product: ManagedProduct) {
    message.textContent = ''
    panel.innerHTML = `<form class="catalog-admin-form"><h2>Publication review · ${e(product.name)}</h2><p>Only verify facts supported by evidence. Research-only wording does not establish legal or platform eligibility. Synthetic fixtures remain isolated from the genuine catalog.</p><label><span>Publication state</span><select name="status">${['draft', 'review', 'published', 'archived'].map(s => `<option ${s === product.publication_status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><div class="catalog-review-checks">${[['authenticity','Authenticity and product details verified'],['eligibility','Legal, platform and payment eligibility reviewed'],['imagery','Image rights and accurate representation verified']].map(([key,label]) => `<label class="catalog-check"><input type="checkbox" name="${key}"> ${label}</label>`).join('')}</div><label><span>Review evidence and source references</span><textarea name="evidence" rows="4" maxlength="5000">${e(product.verification_evidence || '')}</textarea></label><div class="catalog-management-actions"><button class="primary">Save publication state</button><button type="button" data-close class="secondary">Cancel</button></div></form>`
    const form = panel.querySelector('form')!
    form.onsubmit = async event => { event.preventDefault(); const data = new FormData(form); if (data.get('status') === 'published' && (!data.has('authenticity') || !data.has('eligibility') || !data.has('imagery') || !String(data.get('evidence')).trim())) { message.textContent = 'Publication requires all three verifications and evidence.'; message.scrollIntoView({ block: 'nearest' }); return } if (await run(form.querySelector('button')!, 'set_publication', { productId: product.id, status: data.get('status'), verification: { authenticity: data.has('authenticity'), eligibility: data.has('eligibility'), imagery: data.has('imagery'), evidence: data.get('evidence') } }, 'Publication state saved. The server verified publication requirements.')) panel.innerHTML = '' }
    panel.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { panel.innerHTML = '' }
    panel.scrollIntoView({ block: 'start' })
  }
  function render() {
    const filtered = products.filter(p => (!state.search || [p.name,p.sku,p.quantity].join(' ').toLowerCase().includes(state.search.toLowerCase())) && (!state.category || p.category_id === state.category) && (!state.status || p.publication_status === state.status || (state.status === 'unknown' && p.inventory?.stock_on_hand == null) || (state.status === 'out' && p.inventory?.available_to_sell === 0) || (state.status === 'low' && p.inventory?.available_to_sell != null && p.inventory.available_to_sell <= p.inventory.low_stock_threshold)))
    el('#catalog-summary').textContent = `${filtered.length} of ${products.length} products`
    el('#catalog-list').innerHTML = filtered.length ? filtered.map(p => `<article class="catalog-card" data-id="${e(p.id)}"><div class="catalog-card-head"><div><span class="eyebrow">${e(p.sku || 'SKU required')}</span><h2>${e(p.name)}</h2><p>${e(p.category?.name || 'Uncategorized')} · ${e(p.quantity || 'No variant label')}</p></div><span class="catalog-status">${e(p.publication_status || 'draft')}${p.is_synthetic ? ' · synthetic' : ''}</span></div><div class="catalog-meta-grid"><div><span>Price</span><strong>${h.money(p.price)}</strong></div><div><span>On hand</span><strong>${p.inventory?.stock_on_hand ?? 'Unknown'}</strong></div><div><span>Reserved</span><strong>${p.inventory?.reserved_quantity ?? 0}</strong></div><div><span>Available to sell</span><strong>${p.inventory?.available_to_sell ?? 'Unknown'}</strong></div></div><div class="catalog-management-actions"><button class="secondary" data-action="edit">Edit product</button><button class="secondary" data-action="inventory">Adjust stock</button><button class="secondary" data-action="publication">Review publication</button><button class="secondary" data-action="history">History</button></div><div class="catalog-history" aria-live="polite"></div></article>`).join('') : '<div class="empty-state"><h2>No matching products</h2><p>Create a draft or change your filters.</p></div>'
  }
  async function refresh() {
    const data = await loadCoreCatalog(); if (!root.isConnected) return
    products = data.products; categories = data.categories
    el<HTMLSelectElement>('#catalog-category').innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('')
    el<HTMLSelectElement>('#catalog-category').value = state.category
    el('#catalog-metrics').innerHTML = [['Products', products.length],['Published', products.filter(p => p.publication_status === 'published').length],['Awaiting review',products.filter(p => p.publication_status === 'review').length],['Unknown stock',products.filter(p => p.inventory?.stock_on_hand == null).length]].map(([label,value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')
    render()
  }
  el<HTMLButtonElement>('#catalog-create').onclick = () => edit()
  el<HTMLButtonElement>('#catalog-refresh').onclick = async () => { try { await refresh(); message.textContent = 'Catalog refreshed.' } catch (error) { message.textContent = String(error) } }
  el<HTMLButtonElement>('#catalog-category-create').onclick = () => {
    message.textContent = ''
    panel.innerHTML = `<form class="catalog-admin-form"><h2>Manage categories</h2><label><span>Category</span><select name="id"><option value="">New category</option>${categories.map(c => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}</select></label><div class="catalog-editor-grid">${input('Name','name','','required maxlength="100"')}${input('URL slug','slug','','required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="100"')}${input('Description','description','','maxlength="1000"')}<label class="catalog-check"><input type="checkbox" name="active" checked> Active category</label></div><div class="catalog-management-actions"><button class="primary">Save category</button><button type="button" data-close class="secondary">Cancel</button></div></form>`
    const form = panel.querySelector('form')!
    form.querySelector<HTMLSelectElement>('select')!.onchange = event => { const category = categories.find(c => c.id === (event.target as HTMLSelectElement).value); for (const key of ['name','slug','description'] as const) form.querySelector<HTMLInputElement>(`[name="${key}"]`)!.value = category?.[key] || ''; form.querySelector<HTMLInputElement>('[name="active"]')!.checked = category?.active ?? true }
    form.onsubmit = async event => { event.preventDefault(); const data = new FormData(form); if (await run(form.querySelector('button')!, 'save_category', { categoryId: data.get('id') || undefined, category: { name: data.get('name'), slug: data.get('slug'), description: data.get('description'), active: data.has('active') } }, 'Category saved.')) panel.innerHTML = '' }
    panel.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { panel.innerHTML = '' }
  }
  el<HTMLInputElement>('#catalog-search').value = state.search
  el<HTMLInputElement>('#catalog-search').oninput = event => { state.search = (event.target as HTMLInputElement).value; render() }
  el<HTMLSelectElement>('#catalog-category').onchange = event => { state.category = (event.target as HTMLSelectElement).value; render() }
  el<HTMLSelectElement>('#catalog-state').value = state.status
  el<HTMLSelectElement>('#catalog-state').onchange = event => { state.status = (event.target as HTMLSelectElement).value; render() }
  el('#catalog-list').onclick = async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]'); if (!button) return
    const card = button.closest<HTMLElement>('[data-id]')!; const product = products.find(p => p.id === card.dataset.id); if (!product) return
    if (button.dataset.action === 'edit') edit(product)
    if (button.dataset.action === 'inventory') inventory(product)
    if (button.dataset.action === 'publication') publication(product)
    if (button.dataset.action === 'history') {
      const history = card.querySelector<HTMLElement>('.catalog-history')!; history.textContent = 'Loading history…'; button.disabled = true
      try { const data = await catalogCommand('history', { productId: product.id }); const events = data.events as Record<string, unknown>[]; history.innerHTML = events.length ? `<ol>${events.map(item => `<li><strong>${e(item.action || item.event_type || 'Change')}</strong> · ${e(h.dateTime(String(item.created_at || '')))}<pre>${e(JSON.stringify({ before: item.before_data, after: item.after_data, metadata: item.metadata }, null, 2))}</pre></li>`).join('')}</ol>` : '<p>No recorded changes.</p>' } catch (error) { history.textContent = error instanceof Error ? error.message : 'Unable to load history.' } finally { button.disabled = false }
    }
  }
  try { await refresh() } catch (error) { el('#catalog-list').innerHTML = `<div class="empty-state error-state"><h2>Could not load catalog</h2><p>${e(error instanceof Error ? error.message : 'Unexpected error')}</p><p>Use Refresh to retry.</p></div>` }
}
