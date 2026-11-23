export interface Warehouse {
  id: string;
  label: string;
  pickupLabel: string;
  locationId: number;
  pickupMethodId: number;
  allowShipping: boolean;
}

export function getShippingOriginWarehouse(enabledWarehouses: Warehouse[]) {
  // BigCommerce reserves inventory location 1 for the store's shipping origin.
  return enabledWarehouses.find((warehouse) => warehouse.locationId === 1);
}

export interface StockDemand {
  key: string;
  name: string;
  quantity: number;
}
export class WarehouseError extends Error {
  readonly shortage?: string;

  constructor(message: string, shortage?: string) {
    super(message);
    this.shortage = shortage;
  }
}

// An empty warehouse has a selection before BigCommerce creates its first cart.
export function warehouseCartKey(cartId: string | null, warehouseId: string) {
  return JSON.stringify([cartId, warehouseId]);
}

export function assertStock(demands: StockDemand[], available: Map<string, number>, label: string) {
  const totals = new Map<string, StockDemand>();

  demands.forEach((demand) => {
    if (!Number.isSafeInteger(demand.quantity) || demand.quantity < 1)
      throw new WarehouseError('Enter a whole quantity greater than zero.');

    const previous = totals.get(demand.key);

    totals.set(demand.key, { ...demand, quantity: demand.quantity + (previous?.quantity ?? 0) });
  });
  totals.forEach((demand) => {
    const stock = available.get(demand.key);

    if (stock === undefined || !Number.isFinite(stock) || demand.quantity > stock) {
      const shortage = `${demand.name}: ${Math.max(0, stock ?? 0)} available at ${label}; ${demand.quantity} requested.`;

      throw new WarehouseError(
        `${shortage} Your cart and warehouse have not been changed.`,
        shortage,
      );
    }
  });
}

export interface WarehouseConsignment {
  id: string;
  line_item_ids: string[];
  selected_pickup_option?: { pickup_method_id: number };
  selected_shipping_option?: { id?: string; type: string };
}

export function warehouseFulfillmentCompatible(
  warehouse: Warehouse,
  itemIds: string[],
  consignments: WarehouseConsignment[],
) {
  const assigned = consignments.flatMap((consignment) => consignment.line_item_ids);

  return (
    consignments.length <= 1 &&
    new Set(assigned).size === assigned.length &&
    assigned.every((id) => itemIds.includes(id)) &&
    (!consignments.some(
      (consignment) => consignment.selected_pickup_option || consignment.selected_shipping_option,
    ) ||
      assigned.length === itemIds.length) &&
    consignments.every((consignment) =>
      consignment.selected_pickup_option
        ? consignment.selected_pickup_option.pickup_method_id === warehouse.pickupMethodId
        : !consignment.selected_shipping_option ||
          (warehouse.allowShipping &&
            consignment.selected_shipping_option.type !== 'shipping_pickupinstore'),
    )
  );
}
