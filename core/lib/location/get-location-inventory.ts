import { z } from 'zod';

const responseSchema = z.object({
  data: z.array(
    z.object({
      available_to_sell: z.number(),
      identity: z.object({ sku: z.string(), product_id: z.number() }),
      settings: z.object({
        is_in_stock: z.boolean(),
        warning_level: z.number(),
      }),
    }),
  ),
  meta: z
    .object({
      pagination: z.object({ total_pages: z.number() }),
    })
    .optional(),
});

export interface LocationInventory {
  availableToSell: number;
  isInStock: boolean;
  locationEntityId: number;
  warningLevel: number;
}

/**
 * Reads authoritative location inventory. Storefront GraphQL can omit location records based on
 * storefront visibility and the store's multi-location inventory mode.
 * @param {number} locationId BigCommerce inventory location ID.
 * @param {string} sku Product or selected variant SKU.
 * @returns {Promise<LocationInventory | undefined>} Inventory for the SKU at the chosen location.
 */
export async function getLocationInventory(
  locationId: number,
  sku: string,
): Promise<LocationInventory | undefined> {
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;

  if (!accessToken || !storeHash || !sku) return undefined;

  const response = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v3/inventory/locations/${locationId}/items?sku:in=${encodeURIComponent(sku)}&limit=1`,
    {
      headers: {
        Accept: 'application/json',
        'X-Auth-Token': accessToken,
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to retrieve BigCommerce location inventory (${response.status}).`);
  }

  const item = responseSchema
    .parse(await response.json())
    .data.find(({ identity }) => identity.sku === sku);

  if (!item) return undefined;

  return {
    availableToSell: item.available_to_sell,
    isInStock: item.settings.is_in_stock && item.available_to_sell > 0,
    locationEntityId: locationId,
    warningLevel: item.settings.warning_level,
  };
}

export type LocationInventoryItem = z.infer<typeof responseSchema>['data'][number];

/**
 * Load product and variant inventory in batches, scoped to the chosen location.
 * @param {number} locationId Selected BigCommerce inventory location.
 * @param {number[]} productIds Products whose inventory should be loaded.
 * @returns {Promise<LocationInventoryItem[]>} All inventory records for these products at this location.
 */
export async function getLocationProductInventory(
  locationId: number,
  productIds: number[],
): Promise<LocationInventoryItem[]> {
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const ids = [...new Set(productIds)];

  if (!accessToken || !storeHash || ids.length === 0) return [];

  const items: LocationInventoryItem[] = [];

  for (let offset = 0; offset < ids.length; offset += 50) {
    let totalPages = 1;

    for (let page = 1; page <= totalPages; page += 1) {
      const query = new URLSearchParams({
        'product_id:in': ids.slice(offset, offset + 50).join(','),
        limit: '250',
        page: String(page),
      });
      // Serialize pages and batches to avoid bursting the management API rate limit.
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/inventory/locations/${locationId}/items?${query.toString()}`,
        { headers: { Accept: 'application/json', 'X-Auth-Token': accessToken }, cache: 'no-store' },
      );

      if (!response.ok) {
        throw new Error(`Unable to retrieve BigCommerce location inventory (${response.status}).`);
      }

      // eslint-disable-next-line no-await-in-loop
      const result = responseSchema.parse(await response.json());

      items.push(...result.data);
      totalPages = result.meta?.pagination.total_pages ?? 1;
    }
  }

  return items;
}

interface InventoryProduct {
  entityId: number;
  sku: string;
  inventory: {
    isStockTracked: boolean;
    hasVariantInventory: boolean;
    isInStock: boolean;
  };
}

/**
 * Never fall back to another location when a tracked product has no inventory record.
 * @param {T[]} products Storefront products with stock tracking information.
 * @param {LocationInventoryItem[]} items Inventory records from the selected location.
 * @returns {T[]} Products with selected-location availability and quantities.
 */
export function applyLocationInventory<T extends InventoryProduct>(
  products: T[],
  items: LocationInventoryItem[],
): T[] {
  return products.map((product) => {
    if (!product.inventory.isStockTracked) return product;

    const matchingItems = items.filter(
      ({ identity }) =>
        identity.product_id === product.entityId &&
        (product.inventory.hasVariantInventory || identity.sku === product.sku),
    );
    const isInStock = matchingItems.some(
      (record) => record.settings.is_in_stock && record.available_to_sell > 0,
    );
    const item = matchingItems[0];

    return {
      ...product,
      inventory: {
        ...product.inventory,
        isInStock,
        // An unselected variant has no meaningful single stock count.
        aggregated: product.inventory.hasVariantInventory
          ? null
          : {
              availableToSell: item?.available_to_sell ?? 0,
              availableOnHand: item?.available_to_sell ?? 0,
              warningLevel: item?.settings.warning_level ?? 0,
              availableForBackorder: 0,
              unlimitedBackorder: false,
            },
      },
    };
  });
}
