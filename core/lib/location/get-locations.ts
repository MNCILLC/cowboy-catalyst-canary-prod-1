import { z } from 'zod';

import { revalidate } from '~/client/revalidate-target';

const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().int().positive(),
      label: z.string().min(1),
    }),
  ),
  meta: z
    .object({
      pagination: z.object({ total_pages: z.number().int().positive() }),
    })
    .optional(),
});

export interface ShoppingLocation {
  id: number;
  label: string;
}

async function getLocationsPage(
  accessToken: string,
  storeHash: string,
  page: number,
): Promise<z.infer<typeof responseSchema>> {
  const response = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v3/inventory/locations?limit=250&page=${page}`,
    {
      headers: {
        Accept: 'application/json',
        'X-Auth-Token': accessToken,
      },
      next: { revalidate },
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to retrieve BigCommerce locations (${response.status}).`);
  }

  return responseSchema.parse(await response.json());
}

/**
 * Storefront GraphQL only returns locations made available to the current storefront channel.
 * The management Locations API is used here so the shopper can choose from every store location.
 * @returns {Promise<ShoppingLocation[]>} Every configured location, or an empty list without credentials.
 */
export async function getAllLocations(): Promise<ShoppingLocation[]> {
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;

  if (!accessToken || !storeHash) return [];

  const firstPage = await getLocationsPage(accessToken, storeHash, 1);
  const totalPages = firstPage.meta?.pagination.total_pages ?? 1;
  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getLocationsPage(accessToken, storeHash, index + 2),
    ),
  );
  const locations = [firstPage, ...remainingPages].flatMap(({ data }) => data);

  return locations.map(({ id, label }) => ({ id, label }));
}
