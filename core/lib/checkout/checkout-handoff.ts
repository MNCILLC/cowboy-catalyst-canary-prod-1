import 'server-only';

import { CheckoutHandoffError, requestCheckoutHandoff } from './handoff-client';

export function isLocationCheckoutEnabled() {
  return process.env.ENABLE_CUSTOM_LOCATION_CHECKOUT === 'true';
}

export async function createCheckoutHandoff(input: {
  cartId: string;
  channelId: number;
  locationId: number;
}) {
  const apiOrigin = process.env.ORDER_MANAGEMENT_ORIGIN;
  const secret = process.env.CHECKOUT_BRIDGE_SECRET;

  if (!apiOrigin || !secret) {
    throw new CheckoutHandoffError('The custom checkout connection is not configured.');
  }

  return requestCheckoutHandoff(input, { apiOrigin, secret });
}
