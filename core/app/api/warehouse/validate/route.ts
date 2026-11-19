import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { authorizeCheckTest } from '~/lib/warehouse/check-test-server';
import { warehouseCheckoutOriginAllowed, warehousePreviewEnabled } from '~/lib/warehouse/config';
import { WarehouseError } from '~/lib/warehouse/policy';
import { readSubmissionRecovery } from '~/lib/warehouse/recovery';
import { authorizeTestProvider } from '~/lib/warehouse/test-provider-server';
import { validateWarehouseCheckout } from '~/lib/warehouse/validation';

export const runtime = 'nodejs';

const inputSchema = z
  .object({
    cartId: z.string().uuid(),
    revision: z.string().uuid(),
    checkTest: z
      .object({
        token: z.string().min(1).max(4096),
        methodId: z.string().min(1),
        gatewayId: z.string().nullable(),
      })
      .strict()
      .optional(),
    testProvider: z
      .object({
        token: z.string().min(1).max(4096),
        methodId: z.literal('bigpaypay'),
        gatewayId: z.null(),
        usesStoredInstrument: z.literal(false),
        shouldSaveInstrument: z.literal(false),
      })
      .strict()
      .optional(),
    requestedMode: z.enum(['shipping', 'pickup']).optional(),
    submission: z
      .object({
        grandTotal: z.number().finite().nonnegative(),
        items: z
          .array(
            z
              .object({
                id: z.string().min(1),
                productId: z.number().int().positive(),
                variantId: z.number().int().nonnegative(),
                quantity: z.number().int().positive(),
              })
              .strict(),
          )
          .min(1),
        consignments: z
          .array(
            z
              .object({
                id: z.string().min(1),
                lineItemIds: z.array(z.string().min(1)),
                pickupMethodId: z.number().int().positive().nullable(),
                shippingOptionId: z.string().min(1).nullable(),
              })
              .strict(),
          )
          .length(1),
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

    if (input.checkTest && input.testProvider)
      throw new WarehouseValidationError('Choose one test authorization.', 400, 'INVALID_REQUEST');

    if (await readSubmissionRecovery(authorization.slice(7), origin, input.cartId, input.revision))
      return NextResponse.json(
        {
          version: 1,
          cartId: input.cartId,
          revision: input.revision,
          code: 'SUBMISSION_REVIEW_REQUIRED',
          recovery: { status: 'review_required' },
          message:
            'An order attempt has been recorded. Do not submit again. Contact the store to confirm its outcome.',
        },
        { status: 409, headers },
      );

    const result = await validateWarehouseCheckout(
      authorization.slice(7),
      origin,
      input.cartId,
      input.revision,
      input.requestedMode,
      input.submission,
    );

    const checkTest = await authorizeCheckTest({
      token: authorization.slice(7),
      origin,
      cartId: input.cartId,
      revision: input.revision,
      warehouseId: result.warehouse.id,
      submission: input.submission,
      claim: input.checkTest,
    });

    const testProvider = await authorizeTestProvider({
      token: authorization.slice(7),
      origin,
      cartId: input.cartId,
      revision: input.revision,
      warehouseId: result.warehouse.id,
      submission: input.submission,
      claim: input.testProvider,
    });

    return NextResponse.json({ ...result, ...checkTest, ...testProvider }, { headers });
  } catch (error) {
    let status = 503;
    let code = 'UNAVAILABLE';
    let message = 'Unable to verify warehouse inventory. Please retry.';

    if (error instanceof WarehouseValidationError) {
      status = error.status;
      code = error.code;
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
