'use server';

import { revalidateTag } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { TAGS } from '~/client/tags';
import { clearCartId, getCartId } from '~/lib/cart';
import { prepareLoyaltyForItemRemoval } from '~/lib/loyalty/server';

const DeleteCartLineItemMutation = graphql(`
  mutation DeleteCartLineItemMutation($input: DeleteCartLineItemInput!) {
    cart {
      deleteCartLineItem(input: $input) {
        cart {
          entityId
        }
      }
    }
  }
`);

type Variables = VariablesOf<typeof DeleteCartLineItemMutation>;
type DeleteCartLineItemInput = Variables['input'];

export async function removeItem({
  lineItemEntityId,
}: Omit<DeleteCartLineItemInput, 'cartEntityId'>) {
  const t = await getTranslations('Cart.Errors');

  const customerAccessToken = await getSessionCustomerAccessToken();

  const cartId = await getCartId();

  if (!cartId) {
    throw new Error(t('cartNotFound'));
  }

  if (!lineItemEntityId) {
    throw new Error(t('lineItemNotFound'));
  }

  try {
    const version = await prepareLoyaltyForItemRemoval(cartId, lineItemEntityId);
    const response = await client.fetch({
      document: DeleteCartLineItemMutation,
      variables: {
        input: {
          cartEntityId: cartId,
          lineItemEntityId,
          ...(version === undefined ? {} : { version }),
        },
      },
      customerAccessToken,
      fetchOptions: { cache: 'no-store' },
    });
    const cart = response.data.cart.deleteCartLineItem?.cart;

    // BigCommerce deletes the cart when its last item is removed. Any loyalty
    // reservation has already been released before that checkout disappears.
    if (!cart) await clearCartId();

    return cart;
  } finally {
    // A confirmed points release may be followed by a failed item deletion.
    // Refresh totals in that case too so the removed discount is not left visible.
    revalidateTag(TAGS.cart, { expire: 0 });
    revalidateTag(TAGS.checkout, { expire: 0 });
  }
}
