import { z } from 'zod';

export class CheckoutHandoffError extends Error {}

const responseSchema = z.object({
  cartId: z.string().uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  intentId: z.string().uuid(),
  expiresAt: z.string().datetime(),
});

/**
 * Requests a cart-scoped checkout token over the private server-to-server bridge.
 * @param {object} input Cart, channel and location selected by the current session.
 * @param {object} config Backend origin and server-only shared secret.
 * @param {Function} transport HTTP transport, injectable for tests.
 * @returns {Promise<Array>} Public redirect parameters containing only the scoped token.
 */
export async function requestCheckoutHandoff(
  input: { cartId: string; channelId: number; locationId: number },
  config: { apiOrigin: string; secret: string },
  transport: typeof fetch = fetch,
) {
  const origin = new URL(config.apiOrigin);
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname);

  if (
    origin.origin !== config.apiOrigin ||
    origin.username ||
    origin.password ||
    (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
    config.secret.length < 32
  ) {
    throw new CheckoutHandoffError('Order-management connection is not configured.');
  }

  const response = await transport(`${origin.origin}/api/integrations/checkout/intents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, fulfillmentType: 'shipping' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    // Only known public error codes become shopper messages; never forward raw backend errors.
    const body: unknown = await response.json().catch(() => null);
    const code = z.object({ code: z.string() }).safeParse(body);
    const messages: Record<string, string> = {
      unsupported_cart:
        'This cart contains a product that is not supported for checkout. Please review your cart.',
      unsupported_location:
        'One or more cart products are not approved for your selected shipping location. Please review your cart and location.',
      stock_unavailable:
        'One or more cart products do not have enough stock at your selected shipping location. Please review your quantities.',
    };

    throw new CheckoutHandoffError(
      (code.success ? messages[code.data.code] : undefined) ??
        'We could not confirm your checkout. Please review your cart and try again.',
    );
  }

  const result = responseSchema.parse(await response.json());

  if (result.cartId !== input.cartId || Date.parse(result.expiresAt) <= Date.now()) {
    throw new CheckoutHandoffError('Checkout location confirmation does not match this cart.');
  }

  return [{ key: 'ofo_location_token', value: result.token }];
}
