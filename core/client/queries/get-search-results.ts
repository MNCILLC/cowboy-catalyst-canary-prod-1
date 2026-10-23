import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { cache } from 'react';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';
import { ProductCardFragment } from '~/components/product-card/fragment';
import { hasZeroPrice } from '~/data-transformers/prices-transformer';
import { isShowCrateProduct } from '~/data-transformers/show-crate-product-transformer';
import { requiresPricingLogin } from '~/lib/wholesale-pricing';
import { hideWholesalePrices } from '~/lib/wholesale-pricing-policy';

const GetQuickSearchResultsQuery = graphql(
  `
    query getQuickSearchResults(
      $filters: SearchProductsFiltersInput!
      $currencyCode: currencyCode
    ) {
      site {
        search {
          searchProducts(filters: $filters) {
            products(first: 5) {
              edges {
                node {
                  categories {
                    edges {
                      node {
                        name
                        path
                      }
                    }
                  }
                  ...ProductCardFragment
                }
              }
            }
          }
        }
      }
    }
  `,
  [ProductCardFragment],
);

export const getSearchResults = cache(async (searchTerm: string, locale?: string) => {
  const customerAccessToken = await getSessionCustomerAccessToken();

  try {
    const response = await client.fetch({
      document: GetQuickSearchResultsQuery,
      variables: { filters: { searchTerm } },
      customerAccessToken,
      fetchOptions: {
        ...(locale && { headers: { 'Accept-Language': locale } }),
        ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
      },
    });

    const { products } = response.data.site.search.searchProducts;

    const hidePrices = await requiresPricingLogin();

    return {
      status: 'success',
      data: {
        products: removeEdgesAndNodes(products)
          .filter((product) => isShowCrateProduct(product) || !hasZeroPrice(product))
          .map((product) => hideWholesalePrices(product, hidePrices)),
      },
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { status: 'error', error: error.message };
    }

    return { status: 'error', error: 'Something went wrong. Please try again.' };
  }
});
