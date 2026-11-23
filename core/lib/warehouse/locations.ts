import 'server-only';

import { unstable_rethrow as rethrow } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';

import { formatOriginAddress } from '~/lib/map-section/address';

import { warehouseApi } from './api';
import { WarehouseValidationError } from './authorization';
import { getWarehouses } from './config';

const addressPart = z.string().trim().catch('');
const mapAddress = z
  .object({
    address1: addressPart,
    address2: addressPart,
    city: addressPart,
    state: addressPart,
    zip: addressPart,
    country_code: addressPart,
  })
  .transform(({ address1, address2, city, state, zip, country_code: countryCode }) => {
    const formatted = formatOriginAddress({
      address1,
      address2,
      city,
      stateOrProvince: state,
      postalCode: zip,
      countryCode,
    });

    const cityState = [city, state].filter(Boolean).join(', ');

    return formatted || cityState ? { formatted, cityState } : null;
  })
  .catch(null);

export type WarehouseMapAddress = NonNullable<z.infer<typeof mapAddress>>;

const locationsSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    enabled: z.boolean(),
    storefront_visibility: z.boolean().catch(false),
    address: mapAddress,
  }),
);
const batchSize = 50;

// Share reads within a render only. warehouseApi uses no-store for the next request.
export const getWarehouseLocations = cache(async () => {
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
    const mapAddresses = new Map(
      batches
        .flat()
        .filter((location) => location.enabled)
        .map((location) => [location.id, location.storefront_visibility ? location.address : null]),
    );

    return { warehouses: configured.filter((w) => mapAddresses.has(w.locationId)), mapAddresses };
  } catch (error) {
    rethrow(error);
    throw new WarehouseValidationError(
      'Warehouse locations are temporarily unavailable. Please try again.',
      503,
      'WAREHOUSE_LOCATIONS_UNAVAILABLE',
    );
  }
});

export async function getEnabledWarehouses() {
  return (await getWarehouseLocations()).warehouses;
}
