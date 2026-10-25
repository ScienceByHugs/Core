import { invokeCore } from './invoke';
import { categoryPayload, productPayload, publicationPayload, stockPayload, type CoreCatalogCategory, type ManagedProduct, type ProductDraft, type PublicationState, type Verification } from './catalog-model';
export type CatalogWorkspace = { products: ManagedProduct[]; categories: CoreCatalogCategory[] };
export type CatalogEvent = { id: string; action?: string; created_at: string; before_data?: unknown; after_data?: unknown; metadata?: unknown };
export async function loadCatalog(): Promise<CatalogWorkspace> {
  const data = await invokeCore<CatalogWorkspace & { success: boolean }>('core-catalog');
  if (data.success !== true || !Array.isArray(data.products) || !Array.isArray(data.categories)) throw new Error('Could not load catalog. Try again.');
  return { products: data.products, categories: data.categories };
}
async function command(body: Record<string, unknown>) {
  const data = await invokeCore<{ success: boolean; product?: ManagedProduct; category?: CoreCatalogCategory }>('core-catalog-control', body, { retry: false });
  if (data.success !== true) throw new Error('Could not confirm the change. Refresh before retrying.');
  return data;
}
function confirmedProduct(data: { product?: ManagedProduct }, id?: string) {
  if (!data.product?.id || (id && data.product.id !== id)) throw new Error('Could not confirm the saved product. Refresh before retrying.');
  return data.product;
}
export async function saveProduct(draft: ProductDraft, productId?: string) {
  return confirmedProduct(await command({ action: 'save_product', ...(productId ? { productId } : {}), product: productPayload(draft) }), productId);
}
export async function adjustStock(product: ManagedProduct, stock: string, threshold: string, reason: string) {
  return confirmedProduct(await command({ action: 'adjust_inventory', productId: product.id, ...stockPayload(stock, threshold, reason, product.inventory?.reserved_quantity ?? 0) }), product.id);
}
export async function savePublication(product: ManagedProduct, status: PublicationState, verification: Verification, categories: CoreCatalogCategory[]) {
  return confirmedProduct(await command({ action: 'set_publication', productId: product.id, ...publicationPayload(product, status, verification, categories) }), product.id);
}
export async function saveCategory(name: string, slug: string, description: string, active: boolean, categoryId?: string) {
  const data = await command({ action: 'save_category', ...(categoryId ? { categoryId } : {}), category: categoryPayload(name, slug, description, active) });
  if (!data.category?.id || (categoryId && data.category.id !== categoryId)) throw new Error('Could not confirm the saved category. Refresh before retrying.');
  return data.category;
}
export async function loadProductHistory(productId: string): Promise<CatalogEvent[]> {
  const data = await invokeCore<{ success: boolean; events: CatalogEvent[] }>('core-catalog-control', { action: 'history', productId });
  if (data.success !== true || !Array.isArray(data.events)) throw new Error('Could not load product history.');
  return data.events;
}
