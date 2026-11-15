'use server';

import { revalidateTag } from 'next/cache';
import { unstable_rethrow as rethrow } from 'next/navigation';

import { TAGS } from '~/client/tags';
import { type PickupBillingResult, PickupCheckoutError } from '~/lib/pickup-checkout/policy';
import { savePickupBilling } from '~/lib/pickup-checkout/server';

export async function updatePickupBilling(
  cartId: string,
  input: unknown,
  version: number,
): Promise<PickupBillingResult> {
  try {
    const address = await savePickupBilling(cartId, input, version);

    revalidateTag(TAGS.cart, { expire: 0 });
    revalidateTag(TAGS.checkout, { expire: 0 });

    return { address };
  } catch (error) {
    rethrow(error);

    return {
      error:
        error instanceof PickupCheckoutError
          ? error.message
          : 'Unable to save billing address. Please retry.',
    };
  }
}
