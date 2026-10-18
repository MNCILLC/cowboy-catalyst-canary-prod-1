'use server';

import { revalidateTag } from 'next/cache';
import { unstable_rethrow as rethrow } from 'next/navigation';
import { z } from 'zod';

import { TAGS } from '~/client/tags';
import { changeLoyaltyPoints, LoyaltyCheckoutError } from '~/lib/loyalty/server';

export interface LoyaltyActionState {
  success: boolean;
  message: string;
}

export async function updateLoyaltyPoints(
  _previous: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  try {
    const action = z.enum(['redeem', 'remove']).parse(formData.get('action'));
    const points =
      action === 'redeem'
        ? z.coerce.number().int().min(100).max(100000).parse(formData.get('points'))
        : undefined;

    await changeLoyaltyPoints(action, points);
    revalidateTag(TAGS.cart, { expire: 0 });

    return {
      success: true,
      message:
        action === 'remove' ? 'Points removed from your cart.' : 'Points applied to your cart.',
    };
  } catch (error) {
    rethrow(error);

    let message = 'We could not update your points. Please retry shortly.';

    if (error instanceof LoyaltyCheckoutError) message = error.message;
    if (error instanceof z.ZodError) message = 'Enter between 100 and 100,000 whole points.';

    return { success: false, message };
  }
}
