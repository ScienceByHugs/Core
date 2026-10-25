export type CoreCatalogCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
  active: boolean
}

export type CoreCatalogProduct = {
  id: string
  product_code: string | null
  sku: string | null
  name: string
  research_name: string | null
  category_id: string | null
  description: string | null
  purity: string | null
  quantity: string | null
  lot_number: string | null
  coa_url: string | null
  price: number
  active: boolean
  core_hidden: boolean
  featured: boolean
  sort_order: number
  image_url: string | null
  product_type: string | null
  shipping_from: string | null
  source: string | null
  storefront_status: string | null
  source_key: string | null
  sync_source: string | null
  last_sync_run_id: string | null
  source_synced_at: string | null
  created_at: string
  updated_at: string
  category: CoreCatalogCategory | null
}

export type CatalogInventory = { stock_on_hand: number | null; reserved_quantity: number; available_to_sell: number | null; low_stock_threshold: number }
export type ManagedProduct = CoreCatalogProduct & {
  publication_status?: 'draft' | 'review' | 'published' | 'archived'
  is_synthetic?: boolean
  verification_evidence?: string | null
  authenticity_verified?: boolean
  eligibility_verified?: boolean
  imagery_verified?: boolean
  inventory?: CatalogInventory | null
}

export const productFields = [
  ['name', 'Product name', 200], ['sku', 'Unique SKU / variant SKU', 100],
  ['quantity', 'Variant / package size (not stock)', 120], ['image_url', 'Authorized image URL', 2000],
  ['description', 'Description', 5000],
] as const;
export type ProductDraft = Record<typeof productFields[number][0], string> & { price: string; category_id: string; featured: boolean };
export function productDraft(product?: ManagedProduct): ProductDraft {
  return { name: product?.name || '', sku: product?.sku || '', quantity: product?.quantity || '',
    image_url: product?.image_url || '', description: product?.description || '', price: product ? String(product.price) : '',
    category_id: product?.category_id || '', featured: product?.featured || false };
}
function safeImage(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function productPayload(draft: ProductDraft) {
  const text = Object.fromEntries(productFields.map(([key, label, limit]) => {
    const value = draft[key].trim();
    if (value.length > limit) throw new Error(`${label} exceeds ${limit} characters.`);
    return [key, value];
  })) as Record<typeof productFields[number][0], string>;
  if (text.name.length < 2 || !text.sku) throw new Error('Product name and unique SKU are required.');
  if (!/^\d+(\.\d{1,2})?$/.test(draft.price.trim())) throw new Error('Enter a USD price with up to two decimal places.');
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price <= 0 || price > 1000000) throw new Error('Price must be greater than zero and at most 1000000.');
  if (text.image_url && !safeImage(text.image_url)) throw new Error('Image URL must use HTTPS without embedded credentials.');
  return { ...text, price, category_id: draft.category_id || null, featured: draft.featured };
}
export function stockPayload(stock: string, threshold: string, reason: string, reserved: number) {
  if (!/^\d+$/.test(stock.trim()) || !/^\d+$/.test(threshold.trim())) throw new Error('Stock and threshold must be whole numbers.');
  const stockOnHand = Number(stock), lowStockThreshold = Number(threshold);
  if (!Number.isSafeInteger(stockOnHand) || !Number.isSafeInteger(lowStockThreshold) || stockOnHand > 2147483647 || lowStockThreshold > 2147483647) throw new Error('Stock values are too large.');
  if (stockOnHand < reserved) throw new Error('Stock cannot be below reserved units.');
  const clean = reason.trim();
  if (clean.length < 3 || clean.length > 500) throw new Error('Adjustment reason must be 3–500 characters.');
  return { stockOnHand, lowStockThreshold, reason: clean };
}
export type PublicationState = 'draft' | 'review' | 'published' | 'archived';
export type Verification = { authenticity: boolean; eligibility: boolean; imagery: boolean; evidence: string };
export function publicationPayload(product: ManagedProduct, status: PublicationState, verification: Verification, categories: CoreCatalogCategory[]) {
  if (!['draft', 'review', 'published', 'archived'].includes(status)) throw new Error('Choose a publication state.');
  const evidence = verification.evidence.trim();
  if (evidence.length > 5000) throw new Error('Evidence exceeds 5000 characters.');
  if (status === 'published') {
    if (product.is_synthetic) throw new Error('Synthetic products cannot be published.');
    if (!verification.authenticity || !verification.eligibility || !verification.imagery || evidence.length < 20) throw new Error('Publication requires all three checks and at least 20 characters of evidence.');
    if (!product.name || !product.sku || !product.description || !product.image_url || !safeImage(product.image_url) || !(product.price > 0) ||
      !categories.some(c => c.id === product.category_id && c.active) || product.inventory?.stock_on_hand == null) throw new Error('Complete product information, an active category, approved image and known stock are required.');
  }
  return { status, verification: { ...verification, evidence } };
}
export function categoryPayload(name: string, slug: string, description: string, active: boolean) {
  const n = name.trim(), s = slug.trim(), d = description.trim();
  if (n.length < 2 || n.length > 100 || s.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || d.length > 1000) throw new Error('Use a name (2–100 characters), lowercase URL slug and description up to 1000 characters.');
  return { name: n, slug: s, description: d, active };
}
export function matchesProduct(p: ManagedProduct, query: string, category: string, state: string) {
  if (category && p.category_id !== category) return false;
  if (state && (p.publication_status || 'draft') !== state) {
    const inv = p.inventory;
    if (!(state === 'unknown' && inv?.stock_on_hand == null) && !(state === 'out' && inv?.available_to_sell === 0) &&
      !(state === 'low' && inv?.available_to_sell != null && inv.available_to_sell > 0 && inv.available_to_sell <= inv.low_stock_threshold)) return false;
  }
  const q = query.trim().toLowerCase();
  return !q || [p.name, p.sku, p.quantity].filter(Boolean).join(' ').toLowerCase().includes(q);
}
