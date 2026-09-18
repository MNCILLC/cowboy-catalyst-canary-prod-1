import 'server-only';

import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { cache } from 'react';

import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { CurrencyCode } from '~/components/header/fragment';
import { ProductCardFragment } from '~/components/product-card/fragment';
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
    const products: Array<{ entityId: number; metafields: Array<{ key: string; value: string }> }> =
      [];
    let after: string | undefined;

    // Scan lightweight metadata only. Cards/prices are fetched for the selected page.
    // Use Storefront search so channel/customer visibility and native filters still apply.
    for (;;) {
      // Cursor pagination must run sequentially.
      // eslint-disable-next-line no-await-in-loop
      const response = await client.fetch({
        document: MatchProductsQuery,
        variables: {
          filters,
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
  const candidates = await getCandidates(filters, sort, customerAccessToken);
  const ids = candidates
    .filter((product) => matchesMetafieldSelections(product.metafields, selections))
    .map((product) => product.entityId);
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
