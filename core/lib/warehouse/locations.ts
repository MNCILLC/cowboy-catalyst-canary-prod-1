import 'server-only';

import { unstable_rethrow as rethrow } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';

import { warehouseApi } from './api';
import { WarehouseValidationError } from './authorization';
import { getWarehouses } from './config';

const locationsSchema = z.array(
  z.object({ id: z.number().int().positive(), enabled: z.boolean() }),
);
const batchSize = 50;

// Share reads within a render only. warehouseApi uses no-store for the next request.
export const getEnabledWarehouses = cache(async () => {
  const configured = getWarehouses();
  const ids = [...new Set(configured.map((warehouse) => warehouse.locationId))];

  try {
    const batches = await Promise.all(
      Array.from({ length: Math.ceil(ids.length / batchSize) }, async (_, i) => {
        const batch = ids.slice(i * batchSize, (i + 1) * batchSize);
        const locations = await warehouseApi<unknown>(
          `inventory/locations?location_id:in=${batch.join(',')}&limit=${batch.length}`,
        );

        return locationsSchema.parse(locations);
      }),
    );
    const enabled = new Set(
      batches
        .flat()
        .filter((location) => location.enabled)
        .map((location) => location.id),
    );

    return configured.filter((warehouse) => enabled.has(warehouse.locationId));
  } catch (error) {
    rethrow(error);
    throw new WarehouseValidationError(
      'Warehouse locations are temporarily unavailable. Please try again.',
      503,
      'WAREHOUSE_LOCATIONS_UNAVAILABLE',
    );
  }
});
