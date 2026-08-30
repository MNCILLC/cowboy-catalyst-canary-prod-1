import { z } from 'zod';

const responseSchema = z.object({
  data: z.array(
    z.object({
      available_to_sell: z.number(),
      identity: z.object({ sku: z.string() }),
      settings: z.object({
        is_in_stock: z.boolean(),
        warning_level: z.number(),
      }),
    }),
  ),
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
