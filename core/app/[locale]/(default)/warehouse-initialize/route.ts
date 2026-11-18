import { NextRequest } from 'next/server';

import { getSessionCustomerAccessToken } from '~/auth';
import { isCheckoutAuthenticationRequired } from '~/lib/checkout-authentication';
import { getWarehouseConfiguration } from '~/lib/warehouse/config';
import { initializationResponse, parseInitializationRequest } from '~/lib/warehouse/initialization';
import { authorizeWarehouseInitialization } from '~/lib/warehouse/server';
import { createValidationAccess } from '~/lib/warehouse/validation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const configuration = getWarehouseConfiguration();

  if (configuration.mode !== 'staging') return new Response(null, { status: 404 });

  let request;

  try {
    request = parseInitializationRequest(req.nextUrl, configuration.checkoutOrigins);
  } catch {
    return new Response('Invalid authorization request.', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    if (isCheckoutAuthenticationRequired && !(await getSessionCustomerAccessToken()))
      return initializationResponse(request);

    // This authenticates the cart against the storefront session and channel,
    // then checks authoritative warehouse state and stock without mutating the cart.
    const { record, warehouse } = await authorizeWarehouseInitialization(request.cartId);
    const warehouseCheckout = {
      version: 1,
      preview: true,
      cartId: request.cartId,
      warehouse,
      validation: createValidationAccess(record, request.checkoutOrigin, req.nextUrl.origin),
    };

    return initializationResponse(request, warehouseCheckout);
  } catch {
    // Never render a raw exception, cart details, or upstream credentials.
    return initializationResponse(request);
  }
}
