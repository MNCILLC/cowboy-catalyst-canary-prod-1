import 'server-only';

import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { cache } from 'react';

import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { getMetafieldFilters } from '~/client/queries/get-metafield-filters';
import { CurrencyCode } from '~/components/header/fragment';
import { ProductCardFragment } from '~/components/product-card/fragment';
import { withLocationInventory } from '~/lib/location/with-location-inventory';
import {
  getMetafieldSelections,
  matchesMetafieldSelections,
  paginateMetafieldMatches,
  productFilterDefinitions,
} from '~/lib/product-metafield-filters';

const MatchProductsQuery = graphql(`
  query MatchMetafieldProducts(
    $filters: SearchProductsFiltersInput!
    $sort: SearchProductsSortInput
    $after: String
    $keys: [String!]
  ) {
    site {
      search {
        searchProducts(filters: $filters, sort: $sort) {
          products(first: 50, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                entityId
                sku
                inventory {
                  isStockTracked
                  hasVariantInventory
                  isInStock
                }
                metafields(namespace: "custom_product", keys: $keys, first: 50) {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

const CardsQuery = graphql(
  `
    query MetafieldFilteredProductCards($ids: [Int!], $first: Int!, $currencyCode: currencyCode) {
      site {
        products(entityIds: $ids, first: $first) {
          edges {
            node {
              ...ProductCardFragment
            }
          }
        }
      }
    }
  `,
  [ProductCardFragment],
);

type SearchVariables = VariablesOf<typeof MatchProductsQuery>;

const getCandidates = cache(
  async (
    filters: SearchVariables['filters'],
    sort: SearchVariables['sort'],
    customerAccessToken?: string,
  ) => {
    const products: Array<{
      entityId: number;
      sku: string;
      inventory: { isStockTracked: boolean; hasVariantInventory: boolean; isInStock: boolean };
      metafields: Array<{ key: string; value: string }>;
    }> = [];
    let after: string | undefined;

    // Scan lightweight metadata only. Cards/prices are fetched for the selected page.
    // Use Storefront search so channel/customer visibility and native filters still apply.
    for (;;) {
      // Cursor pagination must run sequentially.
      // eslint-disable-next-line no-await-in-loop
      const response = await client.fetch({
        document: MatchProductsQuery,
        variables: {
          // Store-wide availability must not exclude stock at the selected location.
          filters: { ...filters, hideOutOfStock: false },
          sort,
          after,
          keys: productFilterDefinitions.map(({ productKey }) => productKey),
        },
        customerAccessToken,
        fetchOptions: customerAccessToken ? { cache: 'no-store' } : { next: { revalidate: 300 } },
      });
      const connection = response.data.site.search.searchProducts.products;

      products.push(
        ...removeEdgesAndNodes(connection).map((product) => ({
          entityId: product.entityId,
          sku: product.sku,
          inventory: product.inventory,
          metafields: removeEdgesAndNodes(product.metafields),
        })),
      );
      if (!connection.pageInfo.hasNextPage) break;

      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
        throw new Error('Unable to paginate product filter candidates.');
      }

      after = connection.pageInfo.endCursor;
    }

    return products;
  },
);

export async function getMetafieldFilteredProducts(
  filters: SearchVariables['filters'],
  sort: SearchVariables['sort'],
  selections: ReturnType<typeof getMetafieldSelections>,
  pagination: { after?: string | null; before?: string | null; limit?: number | null },
  currencyCode?: CurrencyCode,
  customerAccessToken?: string,
) {
  const [candidates, metafieldFilters] = await Promise.all([
    getCandidates(filters, sort, customerAccessToken),
    selections.length > 0 ? getMetafieldFilters() : Promise.resolve([]),
  ]);
  const matchingProducts = candidates.filter((product) =>
    matchesMetafieldSelections(product.metafields, selections, metafieldFilters),
  );
  // Filter the entire sorted candidate set before paginating so totals and pages stay correct.
  const availableProducts = filters.hideOutOfStock
    ? (await withLocationInventory(matchingProducts)).filter(({ inventory }) => inventory.isInStock)
    : matchingProducts;
  const ids = availableProducts.map((product) => product.entityId);
  const { ids: pageIds, ...page } = paginateMetafieldMatches(ids, pagination);

  if (!pageIds.length) return { ...page, items: [] };

  const response = await client.fetch({
    document: CardsQuery,
    variables: { ids: pageIds, first: pageIds.length, currencyCode },
    customerAccessToken,
    fetchOptions: customerAccessToken ? { cache: 'no-store' } : { next: { revalidate: 300 } },
  });
  const cards = new Map(
    removeEdgesAndNodes(response.data.site.products).map((product) => [product.entityId, product]),
  );

  return {
    ...page,
    items: pageIds.flatMap((id) => {
      const card = cards.get(id);

      return card ? [card] : [];
    }),
  };
}
