import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const requestSchema = z
  .object({
    cartId: z.string().uuid(),
    requestId: z.string().regex(/^[a-f0-9]{64}$/),
    checkoutOrigin: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);

        return url.protocol === 'https:' && url.origin === value;
      }),
  })
  .strict();

export type InitializationRequest = z.infer<typeof requestSchema>;

export function parseInitializationRequest(
  url: URL,
  allowedOrigins: string[],
): InitializationRequest {
  const request = requestSchema.parse(Object.fromEntries(url.searchParams));

  if ([...url.searchParams.keys()].length !== 3 || !allowedOrigins.includes(request.checkoutOrigin))
    throw new Error('Invalid initialization request.');

  return request;
}

// No credential is placed in a URL, cookie, or persistent browser storage.
export function initializationResponse(
  request: InitializationRequest,
  warehouseCheckout?: unknown,
): Response {
  const nonce = randomBytes(24).toString('base64');
  const serialize = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const message = serialize({
    protocol: 'warehouse-initialization-v1',
    requestId: request.requestId,
    cartId: request.cartId,
    ...(warehouseCheckout ? { warehouseCheckout } : { error: 'AUTHORIZATION_FAILED' }),
  });
  const target = serialize(request.checkoutOrigin);

  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Warehouse authorization</title><body><p>Return to checkout. If authorization failed, sign in to the storefront and reopen checkout from your cart.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${message},${target});window.close();}</script></body></html>`,
    {
      status: warehouseCheckout ? 200 : 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      },
    },
  );
}
