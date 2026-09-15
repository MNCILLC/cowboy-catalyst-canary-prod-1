import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { cache } from 'react';

import { client } from '~/client';
import { PricingFragment } from '~/client/fragments/pricing';
import { graphql, ResultOf, VariablesOf } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';
import { CurrencyCode } from '~/components/header/fragment';
import { ShowCrateProductCardFragment } from '~/components/product-card/show-crate-fragment';

export const ShowComparisonProductFragment = graphql(
  `
    fragment ShowComparisonProductFragment on Product {
      entityId
      name
      path
      isPriceHidden
      comparisonShowName: customFields(names: ["Show Name"], first: 1) {
        edges {
          node {
            value
          }
        }
      }
      ...ShowCrateProductCardFragment
      ...PricingFragment
    }
  `,
  [ShowCrateProductCardFragment, PricingFragment],
);

const ShowComparisonCategoryQuery = graphql(`
  query ShowComparisonCategoryQuery($path: String!) {
    site {
      route(path: $path, redirectBehavior: FOLLOW) {
        node {
          __typename
          ... on Category {
            entityId
            defaultProductSort
          }
        }
      }
    }
  }
`);

const ShowComparisonProductsQuery = graphql(
  `
    query ShowComparisonProductsQuery(
      $categoryId: Int!
      $sort: CategoryProductSort
      $currencyCode: currencyCode
      $after: String
    ) {
      site {
        settings {
          tax {
            plp
          }
        }
        category(entityId: $categoryId) {
          products(first: 20, after: $after, sortBy: $sort) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                ...ShowComparisonProductFragment
              }
            }
          }
        }
      }
    }
  `,
  [ShowComparisonProductFragment],
);

export const getShowComparisonProducts = cache(
  async (path: string, currencyCode?: CurrencyCode, customerAccessToken?: string) => {
    const fetchOptions = customerAccessToken
      ? { cache: 'no-store' as const }
      : { next: { revalidate } };
    const { data: categoryData } = await client.fetch({
      document: ShowComparisonCategoryQuery,
      variables: { path },
      customerAccessToken,
      fetchOptions,
    });
    const category = categoryData.site.route.node;

    if (category?.__typename !== 'Category') return { products: [], taxDisplay: undefined };

    const products: Array<ResultOf<typeof ShowComparisonProductFragment>> = [];
    let after: string | null = null;

    for (;;) {
      const variables: VariablesOf<typeof ShowComparisonProductsQuery> = {
        categoryId: category.entityId,
        sort:
          category.defaultProductSort && category.defaultProductSort !== 'DEFAULT'
            ? category.defaultProductSort
            : 'FEATURED',
        currencyCode,
        after,
      };

      // eslint-disable-next-line no-await-in-loop -- Each page requires the previous page's cursor.
      const { data } = await client.fetch({
        document: ShowComparisonProductsQuery,
        variables,
        customerAccessToken,
        fetchOptions,
      });
      const connection = data.site.category?.products;
      const eligibleProducts = connection
        ? removeEdgesAndNodes(connection).filter((product) =>
            Boolean(removeEdgesAndNodes(product.comparisonShowName).at(0)?.value.trim()),
          )
        : [];

      products.push(...eligibleProducts.slice(0, 4 - products.length));

      const pageInfo = connection?.pageInfo;

      if (
        products.length === 4 ||
        !pageInfo?.hasNextPage ||
        !pageInfo.endCursor ||
        pageInfo.endCursor === after
      ) {
        return { products, taxDisplay: data.site.settings?.tax?.plp };
      }

      after = pageInfo.endCursor;
    }
  },
);
