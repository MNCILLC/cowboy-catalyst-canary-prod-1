import { unstable_rethrow as rethrow } from 'next/navigation';

import { LoyaltyPoints } from '@/vibes/soul/sections/cart/loyalty-points';
import { getLoyaltyBalance } from '~/lib/loyalty/server';

import { updateLoyaltyPoints } from '../_actions/loyalty-points';

export async function LoyaltyCart({ subtotal, currency }: { subtotal: number; currency: string }) {
  try {
    const state = await getLoyaltyBalance();

    if (!state?.balance.enabled) return null;

    return (
      <LoyaltyPoints
        action={updateLoyaltyPoints}
        balance={state.balance}
        currency={currency}
        signedIn={state.signedIn}
        subtotal={subtotal}
      />
    );
  } catch (error) {
    rethrow(error);

    return null;
  }
}
