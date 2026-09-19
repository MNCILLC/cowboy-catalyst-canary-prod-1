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

export const getProductCartQuantity = cache(
  async (productId: number, customerAccessToken?: string): Promise<number> => {
    const cartId = await getCartId();

    if (!cartId) {
      return 0;
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
      return 0;
    }

    // Include every variant and option combination of this product.
    return [...lineItems.physicalItems, ...lineItems.digitalItems].reduce(
      (quantity, item) =>
        item.productEntityId === productId ? quantity + item.quantity : quantity,
      0,
    );
  },
);
