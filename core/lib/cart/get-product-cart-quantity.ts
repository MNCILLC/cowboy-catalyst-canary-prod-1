import 'server-only';

import { cache } from 'react';

import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { TAGS } from '~/client/tags';

import { getCartId } from './index';

const GetProductCartQuantityQuery = graphql(`
  query GetProductCartQuantityQuery($cartId: String!) {
    site {
      cart(entityId: $cartId) {
        lineItems {
          physicalItems {
            productEntityId
            quantity
          }
          digitalItems {
            productEntityId
            quantity
          }
        }
      }
    }
  }
`);

export const getCartProductQuantities = cache(
  async (customerAccessToken?: string): Promise<Record<string, number>> => {
    const cartId = await getCartId();

    if (!cartId) {
      return {};
    }

    const response = await client.fetch({
      document: GetProductCartQuantityQuery,
      variables: { cartId },
      customerAccessToken,
      fetchOptions: {
        cache: 'no-store',
        next: { tags: [TAGS.cart] },
      },
    });

    const lineItems = response.data.site.cart?.lineItems;

    if (!lineItems) {
      return {};
    }

    // Include every variant and option combination of this product.
    return [...lineItems.physicalItems, ...lineItems.digitalItems].reduce<Record<string, number>>(
      (quantities, item) => {
        const productId = item.productEntityId.toString();

        quantities[productId] = (quantities[productId] ?? 0) + item.quantity;

        return quantities;
      },
      {},
    );
  },
);

export const getProductCartQuantity = async (productId: number, customerAccessToken?: string) => {
  const quantities = await getCartProductQuantities(customerAccessToken);

  return quantities[productId.toString()] ?? 0;
};
