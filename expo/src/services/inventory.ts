import { invokeCore } from './invoke';

// Shapes returned by the core-catalog Edge Function (staging), which joins each
// product to its product_inventory row.
export type Inventory = {
  stock_on_hand: number | null;
  reserved_quantity: number;
  available_to_sell: number | null;
  low_stock_threshold: number;
};

export type InventoryProduct = {
  id: string;
  sku: string | null;
  name: string;
  quantity: string | null;
  lot_number: string | null;
  publication_status?: 'draft' | 'review' | 'published' | 'archived';
  is_synthetic?: boolean;
  inventory?: Inventory | null;
};

export type StockState = 'unknown' | 'out' | 'low' | 'ok';

export function stockState(product: InventoryProduct): StockState {
  const inv = product.inventory;
  if (!inv || inv.stock_on_hand === null || inv.available_to_sell === null) return 'unknown';
  if (inv.available_to_sell <= 0) return 'out';
  if (inv.available_to_sell <= inv.low_stock_threshold) return 'low';
  return 'ok';
}

export async function loadInventory(): Promise<InventoryProduct[]> {
  const data = await invokeCore<{ products?: InventoryProduct[] }>('core-catalog', { action: 'list' });
  return (data.products ?? []).filter(product => product.publication_status !== 'archived');
}
