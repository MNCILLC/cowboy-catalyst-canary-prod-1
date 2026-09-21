import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';

import {
  authorizeProUseProducts,
  getProUseCertification,
  isTrueMetafield,
  Metafield,
  PRO_USE_MESSAGE,
} from './policy';

const MetafieldsResponse = z.object({
  data: z.array(z.object({ namespace: z.string(), key: z.string(), value: z.string() })),
});

// Management API reads also work for private customer metafields. Never return
// credentials or accept a customer ID supplied by the browser.
async function getMetafields(resource: string, namespace: string): Promise<Metafield[]> {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!storeHash || !accessToken) {
    throw new Error('Pro Use verification is not configured.');
  }

  const fields: Metafield[] = [];

  for (let page = 1; ; page += 1) {
    // Pagination depends on the preceding response. Errors must never imply false.
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(
      `https://api.bigcommerce.com/stores/${storeHash}/v3/${resource}/metafields?namespace=${namespace}&limit=250&page=${page}`,
      {
        headers: { 'X-Auth-Token': accessToken, Accept: 'application/json' },
        cache: 'no-store',
      },
    );

    if (!response.ok) throw new Error('Unable to verify Pro Use access. Please try again.');

    // eslint-disable-next-line no-await-in-loop
    const result = MetafieldsResponse.parse(await response.json());

    fields.push(...result.data.filter((field) => field.namespace === namespace));
    if (result.data.length < 250) return fields;
  }
}

const CustomerIdentityQuery = graphql(`
  query ProUseCustomerIdentityQuery {
    customer {
      entityId
    }
  }
`);

export const getCustomerProUseCertification = cache(async () => {
  const customerAccessToken = await getSessionCustomerAccessToken();

  if (!customerAccessToken) return getProUseCertification([]);

  const { data } = await client.fetch({
    document: CustomerIdentityQuery,
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });

  if (!data.customer) return getProUseCertification([]);

  return getProUseCertification(
    await getMetafields(`customers/${data.customer.entityId}`, 'custom_customer'),
  );
});

export const getProUseMessage = cache(async () => {
  const fields = await getMetafields('store', 'custom_site');

  return fields.find(({ key }) => key === 'pro_use_message')?.value || PRO_USE_MESSAGE;
});

export const getProUseDisplayAccess = cache(async () => {
  const [certification, message] = await Promise.allSettled([
    getCustomerProUseCertification(),
    getProUseMessage(),
  ]);

  // Display may degrade gracefully, but must keep restricted purchase controls hidden.
  return {
    isCertified: certification.status === 'fulfilled' && certification.value.isCertified,
    message: message.status === 'fulfilled' ? message.value : PRO_USE_MESSAGE,
  };
});

const isProductRestricted = cache(async (productId: number) => {
  const fields = await getMetafields(`catalog/products/${productId}`, 'custom_product');

  return isTrueMetafield(fields.find(({ key }) => key === 'pro_use_only')?.value);
});

export async function assertProUseProducts(productIds: number[]): Promise<void> {
  await authorizeProUseProducts(productIds, {
    isProductRestricted,
    getCertification: getCustomerProUseCertification,
  });
}

const VariantOwnershipQuery = graphql(`
  query ProUseVariantOwnershipQuery($productId: Int!, $variantId: Int!) {
    site {
      product(entityId: $productId) {
        variants(entityIds: [$variantId], first: 1) {
          edges {
            node {
              entityId
            }
          }
        }
      }
    }
  }
`);

export async function assertProUseLineItems(
  lineItems: Array<{
    productEntityId?: number | null;
    variantEntityId?: number | null;
    sku?: string | null;
  }>,
): Promise<void> {
  // All storefront actions supply product IDs. Reject alternate SKU identities
  // so the checked product cannot differ from the one the mutation purchases.
  if (lineItems.some(({ sku }) => sku != null)) {
    throw new Error('Product IDs are required for Pro Use verification.');
  }

  await assertProUseProducts(lineItems.map(({ productEntityId }) => productEntityId ?? NaN));

  const customerAccessToken = await getSessionCustomerAccessToken();

  await Promise.all(
    lineItems.map(async ({ productEntityId, variantEntityId }) => {
      if (variantEntityId == null) return;

      if (!Number.isSafeInteger(variantEntityId) || variantEntityId <= 0 || !productEntityId) {
        throw new Error('Unable to verify product variant.');
      }

      const { data } = await client.fetch({
        document: VariantOwnershipQuery,
        variables: { productId: productEntityId, variantId: variantEntityId },
        customerAccessToken,
        fetchOptions: { cache: 'no-store' },
      });

      if (
        !data.site.product?.variants.edges?.some(({ node }) => node.entityId === variantEntityId)
      ) {
        throw new Error('Unable to verify product variant.');
      }
    }),
  );
}

const CartProductsQuery = graphql(`
  query ProUseCartProductsQuery($cartId: String!) {
    site {
      cart(entityId: $cartId) {
        lineItems {
          physicalItems {
            entityId
            productEntityId
          }
          digitalItems {
            entityId
            productEntityId
          }
        }
      }
    }
  }
`);

export async function assertProUseCart(cartId: string, lineItemId?: string): Promise<void> {
  const customerAccessToken = await getSessionCustomerAccessToken();
  const { data } = await client.fetch({
    document: CartProductsQuery,
    variables: { cartId },
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });

  if (!data.site.cart) throw new Error('Unable to verify cart.');

  const { physicalItems, digitalItems } = data.site.cart.lineItems;
  const items = [...physicalItems, ...digitalItems].filter(
    (item) => !lineItemId || item.entityId === lineItemId,
  );

  if (lineItemId && items.length === 0) throw new Error('Unable to verify cart item.');

  await assertProUseProducts(items.map(({ productEntityId }) => productEntityId));
}
