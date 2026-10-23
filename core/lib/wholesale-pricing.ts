import 'server-only';

import { cache } from 'react';

import { isLoggedIn } from '~/auth';

import { requiresWholesaleLogin } from './wholesale-pricing-policy';

export const isWholesalePricingMessageEnabled =
  process.env.ENABLE_WHOLESALE_PRICING_MESSAGE === 'true' ||
  process.env.HIDE_PRICES_WHEN_LOGGED_OUT === 'true';

export const requiresPricingLogin = cache(
  async () =>
    process.env.HIDE_PRICES_WHEN_LOGGED_OUT === 'true' &&
    requiresWholesaleLogin(process.env.HIDE_PRICES_WHEN_LOGGED_OUT, await isLoggedIn()),
);

export async function assertPricingAccess() {
  if (await requiresPricingLogin()) {
    throw new Error('Login for Wholesale Prices');
  }
}
