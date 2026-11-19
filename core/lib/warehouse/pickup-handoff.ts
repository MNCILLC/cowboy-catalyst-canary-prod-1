import 'server-only';

import { warehouseApi } from './api';
import { type Warehouse, type WarehouseConsignment, WarehouseError } from './policy';

// Pickup-only stock must be assigned before the native checkout loader checks availability.
// The caller has already authenticated this cart and checked warehouse inventory.
export async function preparePickupOnlyHandoff(
  cartId: string,
  items: Array<{ id: string; quantity: number }>,
  warehouse: Warehouse,
  assertCurrent: () => Promise<void>,
) {
  if (warehouse.allowShipping) return;

  const endpoint = `checkouts/${encodeURIComponent(cartId)}`;
  const matches = (consignments: WarehouseConsignment[]) => {
    const [consignment] = consignments;

    return (
      !!consignment &&
      consignments.length === 1 &&
      consignment.selected_pickup_option?.pickup_method_id === warehouse.pickupMethodId &&
      !consignment.selected_shipping_option &&
      consignment.line_item_ids.length === items.length &&
      new Set(consignment.line_item_ids).size === items.length &&
      items.every((item) => consignment.line_item_ids.includes(item.id))
    );
  };
  const current = await warehouseApi<{ consignments: WarehouseConsignment[] }>(endpoint);

  if (!matches(current.consignments)) {
    await assertCurrent();

    // eslint-disable-next-line no-restricted-syntax
    for (const consignment of current.consignments) {
      // eslint-disable-next-line no-await-in-loop -- Native consignment replacement is sequential.
      await warehouseApi(
        `${endpoint}/consignments/${encodeURIComponent(consignment.id)}`,
        'DELETE',
      );
    }

    await assertCurrent();
    await warehouseApi(`${endpoint}/consignments`, 'POST', [
      {
        pickup_option: { pickup_method_id: warehouse.pickupMethodId },
        line_items: items.map((item) => ({ item_id: item.id, quantity: item.quantity })),
      },
    ]);

    const confirmed = await warehouseApi<{ consignments: WarehouseConsignment[] }>(endpoint);

    if (!matches(confirmed.consignments))
      throw new WarehouseError(
        'Unable to confirm warehouse pickup. Return to your cart and retry.',
      );
  }

  await assertCurrent();
}
