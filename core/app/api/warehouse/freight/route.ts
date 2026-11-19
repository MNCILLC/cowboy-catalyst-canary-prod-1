import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { shippingSelectionSchema } from '~/lib/freight-cart/policy';
import { FreightPreferenceConflict } from '~/lib/freight-cart/transport';
import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { warehouseCheckoutOriginAllowed, warehousePreviewEnabled } from '~/lib/warehouse/config';
import { warehouseFreight } from '~/lib/warehouse/freight';
import { WarehouseError } from '~/lib/warehouse/policy';

export const runtime = 'nodejs';

const inputSchema = z
  .object({
    cartId: z.string().uuid(),
    revision: z.string().uuid(),
    update: z
      .object({
        selection: shippingSelectionSchema,
        expectedVersion: z.number().int().min(0).max(2147483646),
      })
      .strict()
      .optional(),
  })
  .strict();

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function OPTIONS(req: NextRequest) {
  if (!warehousePreviewEnabled()) return new NextResponse(null, { status: 404 });

  if (!warehouseCheckoutOriginAllowed(req.headers.get('origin') ?? ''))
    return new NextResponse(null, { status: 403 });

  // A successful preflight grants no cart access: the signed credential binds the actual origin.
  return new NextResponse(null, {
    status: 204,
    headers: cors(req.headers.get('origin') ?? 'null'),
  });
}

export async function POST(req: NextRequest) {
  if (!warehousePreviewEnabled()) return new NextResponse(null, { status: 404 });

  const origin = req.headers.get('origin') ?? '';

  if (!warehouseCheckoutOriginAllowed(origin))
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: 'Checkout origin is not allowed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );

  const headers = cors(origin || 'null');

  try {
    const authorization = req.headers.get('authorization');

    if (!authorization?.startsWith('Bearer ') || !origin)
      throw new WarehouseValidationError(
        'Checkout authorization is required.',
        401,
        'UNAUTHORIZED',
      );
    if (Number(req.headers.get('content-length') ?? 0) > 65536)
      throw new WarehouseValidationError('Invalid validation request.', 400, 'INVALID_REQUEST');

    const raw = await req.text();

    if (raw.length > 65536)
      throw new WarehouseValidationError('Invalid validation request.', 400, 'INVALID_REQUEST');

    const input = inputSchema.parse(JSON.parse(raw));
    const result = await warehouseFreight(
      authorization.slice(7),
      origin,
      input.cartId,
      input.revision,
      input.update,
    );

    return NextResponse.json(result, { headers });
  } catch (error) {
    let status = 503;
    let code = 'UNAVAILABLE';
    let message = 'Unable to confirm delivery preferences. Reload preferences and retry.';

    if (error instanceof WarehouseValidationError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof FreightPreferenceConflict) {
      status = 409;
      code = 'STALE_FREIGHT';
      message = error.message;
    } else if (error instanceof WarehouseError) {
      status = 409;
      code = 'INVENTORY_CONFLICT';
      message = error.message.replace(
        'Your cart and warehouse have not been changed.',
        'Return to your cart to update these items.',
      );
    } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
      status = 400;
      code = 'INVALID_REQUEST';
      message = 'Invalid validation request.';
    }

    return NextResponse.json({ code, message }, { status, headers });
  }
}
