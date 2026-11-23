import { z } from 'zod';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import {
  automaticInitializationEnabled,
  warehouseCheckoutOriginAllowed,
} from '~/lib/warehouse/config';
import { exchangeCheckoutHandoff } from '~/lib/warehouse/one-click';
import { WarehouseError } from '~/lib/warehouse/policy';

export const runtime = 'nodejs';

const input = z.object({ cartId: z.string().uuid(), handoffId: z.string().uuid() }).strict();

function headers(req: Request) {
  const origin = req.headers.get('origin');

  if (!automaticInitializationEnabled() || !origin || !warehouseCheckoutOriginAllowed(origin))
    return;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function OPTIONS(req: Request) {
  const cors = headers(req);

  return new Response(null, { status: cors ? 204 : 403, headers: cors });
}

export async function POST(req: Request) {
  const cors = headers(req);

  if (!cors) return new Response(null, { status: 403 });

  const bearer = req.headers.get('authorization');

  if (!bearer?.startsWith('Bearer ') || bearer.length > 8192)
    return new Response(null, { status: 401, headers: cors });
  if (
    !req.headers.get('content-type')?.startsWith('application/json') ||
    Number(req.headers.get('content-length') ?? 0) > 1024
  )
    return new Response(null, { status: 400, headers: cors });

  const body = await req.text();

  if (body.length > 1024) return new Response(null, { status: 400, headers: cors });

  let json: unknown;

  try {
    json = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400, headers: cors });
  }

  const data = input.safeParse(json);

  if (!data.success) return new Response(null, { status: 400, headers: cors });

  try {
    const config = await exchangeCheckoutHandoff(
      bearer.slice(7),
      data.data.cartId,
      data.data.handoffId,
      cors['Access-Control-Allow-Origin'],
    );

    return Response.json(config, { headers: cors });
  } catch (error) {
    if (error instanceof WarehouseError && error.shortage)
      return Response.json(
        { code: 'INVENTORY_CONFLICT', message: error.shortage },
        { status: 409, headers: cors },
      );

    return new Response(null, {
      status: error instanceof WarehouseValidationError ? error.status : 503,
      headers: cors,
    });
  }
}
