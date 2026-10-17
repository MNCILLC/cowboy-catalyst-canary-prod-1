import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { cache } from 'react';

import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';
import { FeaturedProductsCarouselFragment } from '~/components/featured-products-carousel/fragment';

const RelatedProductCategoriesQuery = graphql(`
  query RelatedProductCategoriesQuery($entityId: Int!, $after: String) {
    site {
      product(entityId: $entityId) {
        categories(first: 50, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              entityId
              breadcrumbs(depth: 20) {
                edges {
                  node {
                    entityId
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

const RelatedCategoryProductsQuery = graphql(
  `
    query RelatedCategoryProductsQuery(
      $categoryId: Int!
      $after: String
      $currencyCode: currencyCode
    ) {
      site {
        category(entityId: $categoryId) {
          products(first: 16, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                ...FeaturedProductsCarouselFragment
              }
            }
          }
        }
      }
    }
  `,
  [FeaturedProductsCarouselFragment],
);

export const getRelatedProductCategoryIds = cache(
  async (entityId: number, customerAccessToken?: string) => {
    const categories: Array<{ id: number; depth: number }> = [];
    let after: string | null = null;

    for (;;) {
      const variables: VariablesOf<typeof RelatedProductCategoriesQuery> = { entityId, after };
      // eslint-disable-next-line no-await-in-loop -- Category pages require the preceding cursor.
      const { data } = await client.fetch({
        document: RelatedProductCategoriesQuery,
        variables,
        customerAccessToken,
        fetchOptions: customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } },
      });
      const connection = data.site.product?.categories;

      if (!connection) break;

      categories.push(
        ...removeEdgesAndNodes(connection).map((category) => ({
          id: category.entityId,
          depth: removeEdgesAndNodes(category.breadcrumbs).length,
        })),
      );

      if (
        !connection.pageInfo.hasNextPage ||
        !connection.pageInfo.endCursor ||
        connection.pageInfo.endCursor === after
      )
        break;
      after = connection.pageInfo.endCursor;
    }

    // Prefer specific subcategories before broader parent/catalog categories.
    return categories.sort((a, b) => b.depth - a.depth).map((category) => category.id);
  },
);

export const getRelatedCategoryProducts = cache(
  async (
    variables: VariablesOf<typeof RelatedCategoryProductsQuery>,
    customerAccessToken?: string,
  ) => {
    const { data } = await client.fetch({
      document: RelatedCategoryProductsQuery,
      variables,
      customerAccessToken,
      fetchOptions: customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } },
    });
    const connection = data.site.category?.products;

    return {
      products: connection ? removeEdgesAndNodes(connection) : [],
      hasNextPage: connection?.pageInfo.hasNextPage ?? false,
      endCursor: connection?.pageInfo.endCursor,
    };
  },
);
