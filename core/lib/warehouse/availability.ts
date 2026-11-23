import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

import { warehouseApi } from './api';
import {
  describeWarehouseAvailability,
  unknownAvailability,
  type WarehouseAvailability,
} from './availability-policy';
import { warehousePreviewEnabled } from './config';
import { type Warehouse } from './policy';
import { getWarehouseContext } from './server';

// Memoization lasts only for the render/request; nothing is shared between shoppers.
export const getAvailabilityContext = cache(
  async (): Promise<{ enabled: boolean; warehouse?: Warehouse; unavailable?: boolean }> => {
    if (!warehousePreviewEnabled()) return { enabled: false };

    try {
      return { enabled: true, ...(await getWarehouseContext()) };
    } catch {
      return { enabled: true, unavailable: true };
    }
  },
);

const productsSchema = z.array(
  z.object({ id: z.number().int(), type: z.string(), inventory_tracking: z.string() }),
);
const itemsSchema = z.array(
  z.object({
    identity: z.object({ product_id: z.number().int(), variant_id: z.number().int().nullable() }),
    available_to_sell: z.number().finite(),
    settings: z.object({ is_in_stock: z.boolean().optional() }).optional(),
  }),
);

// A page of cards uses batched catalog and location inventory reads, not two calls per card.
const loadAvailability = cache(async (ids: string) => {
  const context = await getAvailabilityContext();

  if (!context.enabled || !context.warehouse || !ids) return { context };

  try {
    const products = productsSchema.parse(
      await warehouseApi<unknown>(
        `catalog/products?id:in=${ids}&include_fields=id,type,inventory_tracking&limit=250`,
      ),
    );
    const items: z.infer<typeof itemsSchema> = [];

    for (let page = 1; ; page += 1) {
      const batch = itemsSchema.parse(
        // eslint-disable-next-line no-await-in-loop -- Read every inventory page before reporting stock.
        await warehouseApi<unknown>(
          `inventory/locations/${context.warehouse.locationId}/items?product_id:in=${ids}&limit=250&page=${page}`,
        ),
      );

      items.push(...batch);
      if (batch.length < 250) break;
    }

    return { context, products, items };
  } catch {
    // Never fall back to aggregated inventory when a location check fails.
    return { context, unavailable: true };
  }
});

export async function getWarehouseAvailability(productIds: number[]) {
  const ids = [...new Set(productIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
  const batches = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) =>
      loadAvailability(
        ids
          .slice(index * 50, index * 50 + 50)
          .sort((a, b) => a - b)
          .join(','),
      ),
    ),
  );

  return (productId: number, variantId?: number): WarehouseAvailability | undefined => {
    const batch =
      batches.find((value) => value.products?.some((p) => p.id === productId)) ?? batches[0];

    if (!batch?.context.enabled) return undefined;
    if (batch.unavailable || batch.context.unavailable) return unknownAvailability();

    const warehouse = batch.context.warehouse;

    if (!warehouse)
      return {
        message: 'Choose a warehouse to see availability.',
        canPurchase: false,
        selectionRequired: 'warehouse',
      };

    return describeWarehouseAvailability(
      batch.products?.find((p) => p.id === productId),
      batch.items ?? [],
      warehouse.label,
      variantId,
      process.env.ENABLE_IN_STOCK_MESSAGE === 'true',
    );
  };
}
