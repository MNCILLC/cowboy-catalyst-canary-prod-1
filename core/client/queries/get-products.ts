import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';

import { getSessionCustomerAccessToken } from '~/auth';
import { getChannelIdFromLocale } from '~/channels.config';
import { client } from '~/client';
import { graphql, ResultOf } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';
import { ProductCardFragment } from '~/components/product-card/fragment';
import { getPreferredCurrencyCode } from '~/lib/currency';
import { getStockDisplayData } from '~/lib/stock-display';

const ProductStockSettingsFragment = graphql(`
  fragment ProductStockSettingsFragment on Settings {
    inventory {
      defaultOutOfStockMessage
      showOutOfStockMessage
      stockLevelDisplay
      showBackorderAvailabilityPrompt
      backorderAvailabilityPrompt
      showQuantityOnBackorder
      showBackorderMessage
    }
  }
`);

async function withStockDisplay(
  products: Array<ResultOf<typeof ProductCardFragment>>,
  settings: ResultOf<typeof ProductStockSettingsFragment> | null | undefined,
  locale?: string,
) {
  const t = locale
    ? await getTranslations({ locale, namespace: 'Product.ProductDetails' })
    : await getTranslations('Product.ProductDetails');

  return products.map((product) => ({
    ...product,
    useEnhancedStockDisplay: process.env.ENABLE_ENHANCED_STOCK_DISPLAY === 'true',
    stockDisplayData: getStockDisplayData(
      // Cards have no selected variant, so a combined quantity would be misleading.
      product.inventory.hasVariantInventory
        ? { isInStock: product.inventory.isInStock }
        : product.inventory,
      settings?.inventory,
      (quantity) => t('currentStock', { quantity }),
    ),
  }));
}

const GetBestSellingProductsQuery = graphql(
  `
    query getBestSellingProducts($currencyCode: currencyCode, $limit: Int) {
      site {
        settings {
          ...ProductStockSettingsFragment
        }
        bestSellingProducts(first: $limit) {
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
  `,
  [ProductCardFragment, ProductStockSettingsFragment],
);

const GetFeaturedProductsQuery = graphql(
  `
    query getFeaturedProducts($currencyCode: currencyCode, $limit: Int) {
      site {
        settings {
          ...ProductStockSettingsFragment
        }
        featuredProducts(first: $limit) {
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
  `,
  [ProductCardFragment, ProductStockSettingsFragment],
);

const GetNewestProductsQuery = graphql(
  `
    query getNewestProducts($currencyCode: currencyCode, $limit: Int) {
      site {
        settings {
          ...ProductStockSettingsFragment
        }
        newestProducts(first: $limit) {
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
  `,
  [ProductCardFragment, ProductStockSettingsFragment],
);

const GetProductsByIds = graphql(
  `
    query GetProductsByIds($entityIds: [Int!], $currencyCode: currencyCode) {
      site {
        settings {
          ...ProductStockSettingsFragment
        }
        products(entityIds: $entityIds) {
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
  `,
  [ProductCardFragment, ProductStockSettingsFragment],
);

const GetCategoryProductsQuery = graphql(
  `
    query GetCategoryProducts($categoryId: Int!, $limit: Int, $currencyCode: currencyCode) {
      site {
        settings {
          ...ProductStockSettingsFragment
        }
        category(entityId: $categoryId) {
          products(first: $limit) {
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
  `,
  [ProductCardFragment, ProductStockSettingsFragment],
);

export type GetProductsResponse = Array<
  NonNullable<
    ResultOf<typeof GetBestSellingProductsQuery>['site']['bestSellingProducts']['edges']
  >[number]['node']
>;

const getBestSellingProducts = cache(
  async ({ locale, limit }: { locale?: string; limit?: number }) => {
    const customerAccessToken = await getSessionCustomerAccessToken();
    const currencyCode = await getPreferredCurrencyCode();
    const channelId = getChannelIdFromLocale(locale);

    try {
      const response = await client.fetch({
        document: GetBestSellingProductsQuery,
        customerAccessToken,
        variables: { currencyCode, limit },
        channelId,
        fetchOptions: {
          ...(locale && { headers: { 'Accept-Language': locale } }),
          ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
        },
      });

      const { bestSellingProducts } = response.data.site;

      return {
        status: 'success',
        products: await withStockDisplay(
          removeEdgesAndNodes(bestSellingProducts),
          response.data.site.settings,
          locale,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { status: 'error', error: error.message };
      }

      return { status: 'error', error: 'Something went wrong. Please try again.' };
    }
  },
);

const getFeaturedProducts = cache(
  async ({ locale, limit }: { locale?: string; limit?: number }) => {
    const customerAccessToken = await getSessionCustomerAccessToken();
    const currencyCode = await getPreferredCurrencyCode();
    const channelId = getChannelIdFromLocale(locale);

    try {
      const response = await client.fetch({
        document: GetFeaturedProductsQuery,
        customerAccessToken,
        variables: { currencyCode, limit },
        channelId,
        fetchOptions: {
          ...(locale && { headers: { 'Accept-Language': locale } }),
          ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
        },
      });

      const { featuredProducts } = response.data.site;

      return {
        status: 'success',
        products: await withStockDisplay(
          removeEdgesAndNodes(featuredProducts),
          response.data.site.settings,
          locale,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { status: 'error', error: error.message };
      }

      return { status: 'error', error: 'Something went wrong. Please try again.' };
    }
  },
);

const getNewestProducts = cache(async ({ locale, limit }: { locale?: string; limit?: number }) => {
  const customerAccessToken = await getSessionCustomerAccessToken();
  const currencyCode = await getPreferredCurrencyCode();
  const channelId = getChannelIdFromLocale(locale);

  try {
    const response = await client.fetch({
      document: GetNewestProductsQuery,
      customerAccessToken,
      variables: { currencyCode, limit },
      channelId,
      fetchOptions: {
        ...(locale && { headers: { 'Accept-Language': locale } }),
        ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
      },
    });

    const { newestProducts } = response.data.site;

    return {
      status: 'success',
      products: await withStockDisplay(
        removeEdgesAndNodes(newestProducts),
        response.data.site.settings,
        locale,
      ),
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { status: 'error', error: error.message };
    }

    return { status: 'error', error: 'Something went wrong. Please try again.' };
  }
});

const getProductsByIds = cache(
  async ({ entityIds, locale }: { entityIds: number[]; locale?: string }) => {
    const customerAccessToken = await getSessionCustomerAccessToken();
    const currencyCode = await getPreferredCurrencyCode();

    try {
      const response = await client.fetch({
        document: GetProductsByIds,
        variables: { entityIds, currencyCode },
        customerAccessToken,
        fetchOptions: {
          ...(locale && { headers: { 'Accept-Language': locale } }),
          ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
        },
      });

      const { products } = response.data.site;

      return {
        status: 'success',
        products: await withStockDisplay(
          removeEdgesAndNodes(products),
          response.data.site.settings,
          locale,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { status: 'error', error: error.message };
      }

      return { status: 'error', error: 'Something went wrong. Please try again.' };
    }
  },
);

const getCategoryProducts = cache(
  async ({
    categoryId,
    limit = 12,
    locale,
  }: {
    categoryId: number;
    limit?: number;
    locale?: string;
  }) => {
    const customerAccessToken = await getSessionCustomerAccessToken();
    const currencyCode = await getPreferredCurrencyCode();
    const channelId = getChannelIdFromLocale(locale);

    try {
      const response = await client.fetch({
        document: GetCategoryProductsQuery,
        variables: { categoryId, limit, currencyCode },
        customerAccessToken,
        channelId,
        fetchOptions: {
          ...(locale && { headers: { 'Accept-Language': locale } }),
          ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
        },
      });
      const category = response.data.site.category;

      return {
        status: 'success',
        products: await withStockDisplay(
          category ? removeEdgesAndNodes(category.products) : [],
          response.data.site.settings,
          locale,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { status: 'error', error: error.message };
      }

      return { status: 'error', error: 'Something went wrong. Please try again.' };
    }
  },
);

export {
  getBestSellingProducts,
  getCategoryProducts,
  getFeaturedProducts,
  getNewestProducts,
  getProductsByIds,
};
