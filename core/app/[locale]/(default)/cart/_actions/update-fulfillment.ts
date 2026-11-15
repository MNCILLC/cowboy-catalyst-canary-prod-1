'use server';

import { revalidateTag } from 'next/cache';
import { unstable_rethrow as rethrow } from 'next/navigation';

import { TAGS } from '~/client/tags';
import { type ShippingSaveResult } from '~/lib/freight-cart/policy';
import { CartShippingError, saveCartShipping } from '~/lib/freight-cart/server';
import { PickupCheckoutError } from '~/lib/pickup-checkout/policy';
import { cleanupPickupCheckout } from '~/lib/pickup-checkout/server';

export async function updateFulfillment(
  cartId: string,
  input: unknown,
): Promise<ShippingSaveResult> {
  try {
    const preferences = await saveCartShipping(cartId, input);

    if (preferences.fulfillmentMethod === 'ship') await cleanupPickupCheckout(cartId);

    revalidateTag(TAGS.cart, { expire: 0 });
    revalidateTag(TAGS.checkout, { expire: 0 });

    return { preferences };
  } catch (error) {
    rethrow(error);

    return {
      error:
        error instanceof CartShippingError || error instanceof PickupCheckoutError
          ? error.message
          : 'Unable to save shipping preferences. Please retry.',
    };
  }
}
