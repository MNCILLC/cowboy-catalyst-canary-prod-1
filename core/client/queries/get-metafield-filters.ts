import 'server-only';

import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { z } from 'zod';

import { parseFilterOptions, productFilterDefinitions } from '~/lib/product-metafield-filters';

const ResponseSchema = z.object({
  data: z.array(z.object({ namespace: z.string(), key: z.string(), value: z.string() })),
});

// Store-level metafields are not exposed by the Storefront GraphQL schema.
// Only their public filter labels/values leave this server-only module.
export const getMetafieldFilters = cache(async () => {
  const t = await getTranslations('Faceted.FacetedSearch.Metafields');
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!storeHash || !accessToken) {
    throw new Error(
      'Product metafield filters require BIGCOMMERCE_STORE_HASH and BIGCOMMERCE_ACCESS_TOKEN.',
    );
  }

  const fields: Array<{ namespace: string; key: string; value: string }> = [];
  let page = 1;

  // Some Management API responses report total_pages=0 for nonempty pages.
  // Continue until a short page rather than trusting that total.
  for (;;) {
    // Each request depends on whether the preceding page was full.
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(
      `https://api.bigcommerce.com/stores/${storeHash}/v3/store/metafields?namespace=custom_site&limit=250&page=${page}`,
      {
        headers: { 'X-Auth-Token': accessToken, Accept: 'application/json' },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok)
      throw new Error(`Unable to load product filter definitions (${response.status}).`);

    // eslint-disable-next-line no-await-in-loop
    const result = ResponseSchema.parse(await response.json());

    fields.push(...result.data);
    if (result.data.length < 250) break;
    page += 1;
  }

  return productFilterDefinitions.flatMap(({ siteKey, productKey }) => {
    const field = fields.find((item) => item.namespace === 'custom_site' && item.key === siteKey);
    const options = field ? parseFilterOptions(field.value) : [];

    return options.length
      ? [
          {
            type: 'checkbox-group' as const,
            paramName: `mf_${productKey}`,
            label: t(productKey),
            options,
          },
        ]
      : [];
  });
});
