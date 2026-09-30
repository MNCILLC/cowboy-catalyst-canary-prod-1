import 'server-only';

import { getPreferredLocationId } from '~/lib/location';

import { applyLocationInventory, getLocationProductInventory } from './get-location-inventory';

export async function withLocationInventory<
  T extends Parameters<typeof applyLocationInventory>[0][number],
>(products: T[]): Promise<T[]> {
  const locationId = await getPreferredLocationId();
  const items = await getLocationProductInventory(
    locationId,
    products.filter(({ inventory }) => inventory.isStockTracked).map(({ entityId }) => entityId),
  );

  return applyLocationInventory(products, items);
}
