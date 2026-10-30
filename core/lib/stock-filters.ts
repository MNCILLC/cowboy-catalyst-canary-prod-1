export type StockFilter = 'in_stock' | 'available_to_ship';

export function parseStockFilters(value: unknown): StockFilter[] {
  const values = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === 'string')
    .flatMap((item) => item.split(','))
    .filter((item): item is StockFilter => item === 'in_stock' || item === 'available_to_ship');

  return [...new Set(values)];
}

interface ShippingInventory {
  isInStock: boolean;
  aggregated?: { availableOnHand: number } | null;
}

// BigCommerce's availableOnHand already deducts safety stock and excludes backorders.
// Unknown/untracked quantities cannot establish that a product is ready to ship.
// Product aggregates include variant inventory; at least some on-hand stock must remain.
export function isAvailableToShip(inventory: ShippingInventory | null | undefined): boolean {
  return inventory?.isInStock === true && (inventory.aggregated?.availableOnHand ?? 0) > 0;
}
