import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { getCartId } from '~/lib/cart';

const CustomerQuery = graphql(`
  query LoyaltyCustomerQuery {
    customer {
      entityId
    }
  }
`);

export const balanceSchema = z.object({
  enabled: z.boolean(),
  currency: z.string(),
  available: z.number().int().nonnegative(),
  nextExpiry: z.string().nullable(),
  expirations: z
    .array(
      z.object({
        expiresAt: z.string().datetime(),
        points: z.number().int().positive(),
      }),
    )
    .optional(),
  rules: z.object({ minimum: z.number(), maximum: z.number(), centsPerPoint: z.number() }),
  redemption: z
    .object({ points: z.number(), phase: z.enum(['applying', 'active', 'removing']) })
    .nullable(),
});
export type LoyaltyBalance = z.infer<typeof balanceSchema>;

export class LoyaltyCheckoutError extends Error {}

export function loyaltyConfigured() {
  return Boolean(process.env.LOYALTY_APP_URL && process.env.LOYALTY_APP_SECRET);
}

async function customerId() {
  const token = await getSessionCustomerAccessToken();

  if (!token) return 0;

  const { data } = await client.fetch({
    document: CustomerQuery,
    customerAccessToken: token,
    fetchOptions: { cache: 'no-store' },
  });

  return data.customer?.entityId ?? 0;
}

async function callLoyalty(body: Record<string, unknown>) {
  const store = process.env.BIGCOMMERCE_STORE_HASH;
  const secret = process.env.LOYALTY_APP_SECRET;
  const base = process.env.LOYALTY_APP_URL;

  if (!store || !secret || !base)
    throw new LoyaltyCheckoutError('Loyalty points are not configured.');

  const url = new URL(`/api/storefront/${store}`, base);

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new LoyaltyCheckoutError('The loyalty connection requires HTTPS.');
  }

  const raw = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = createHmac('sha256', secret)
    .update(`${store}.${timestamp}.${nonce}.${raw}`)
    .digest('hex');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-loyalty-timestamp': timestamp,
      'x-loyalty-nonce': nonce,
      'x-loyalty-signature': signature,
    },
    body: raw,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const data: unknown = await response.json();

  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);

    throw new LoyaltyCheckoutError(
      error.success ? error.data.error : 'Loyalty points are temporarily unavailable.',
    );
  }

  return data;
}

export async function getLoyaltyBalance(): Promise<{
  balance: LoyaltyBalance;
  signedIn: boolean;
} | null> {
  if (!loyaltyConfigured()) return null;

  const id = await customerId();
  const cartId = await getCartId();
  const data = await callLoyalty({ action: 'balance', customerId: id, cartId });

  return { balance: balanceSchema.parse(data), signedIn: id > 0 };
}

export async function changeLoyaltyPoints(action: 'redeem' | 'remove', points?: number) {
  const id = await customerId();
  const cartId = await getCartId();

  if (!id || !cartId)
    throw new LoyaltyCheckoutError('Sign in and add merchandise to your cart to use points.');

  // Customer and cart IDs always come from the server session, never form fields.
  return balanceSchema.parse(await callLoyalty({ action, customerId: id, cartId, points }));
}

export async function assertLoyaltyCheckout(cartId: string) {
  if (!loyaltyConfigured()) return;

  if (cartId !== (await getCartId())) {
    throw new LoyaltyCheckoutError('Return to your cart before checking out.');
  }

  try {
    await callLoyalty({ action: 'validate', customerId: await customerId(), cartId });
  } catch (error) {
    if (error instanceof LoyaltyCheckoutError) throw error;

    throw new LoyaltyCheckoutError(
      'We could not verify loyalty points. Please return to your cart and retry.',
    );
  }
}

export async function getOrderLoyaltyRedemption(orderId: number) {
  if (!loyaltyConfigured()) return null;

  try {
    const id = await customerId();

    if (!id) return null;

    const result = await callLoyalty({ action: 'order', customerId: id, orderId });

    return z
      .object({
        redemption: z
          .object({
            points: z.number().int().positive(),
            amount: z.number().positive(),
            currency: z.string(),
          })
          .nullable(),
      })
      .parse(result).redemption;
  } catch {
    // Order history remains available with the generic discount if the loyalty app is unavailable.
    return null;
  }
}

export async function getAccountLoyaltyBalance() {
  if (!loyaltyConfigured()) return null;

  const id = await customerId();

  if (!id) return null;

  return balanceSchema.parse(await callLoyalty({ action: 'balance', customerId: id }));
}
