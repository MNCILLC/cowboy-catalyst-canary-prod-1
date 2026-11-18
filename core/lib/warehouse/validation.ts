import 'server-only';

import { warehouseApi } from './api';
import {
  assertCurrentRecord,
  signValidationClaims,
  verifyValidationClaims,
  WarehouseRecord,
  WarehouseValidationError,
} from './authorization';
import { getWarehouses } from './config';
import { readWarehouseRecord } from './persistence';
import { WarehouseConsignment, warehouseFulfillmentCompatible } from './policy';
import { checkWarehouseStock } from './server';

function signingSecret() {
  const secret =
    process.env.WAREHOUSE_VALIDATION_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;

  if (!secret || secret.length < 32)
    throw new WarehouseValidationError(
      'Warehouse validation signing is not configured.',
      503,
      'UNAVAILABLE',
    );

  return `warehouse-validation-v1:${secret}`;
}

export function createValidationAccess(
  record: WarehouseRecord,
  checkoutOrigin: string,
  storefrontOrigin: string,
) {
  const endpoint = new URL(
    '/api/warehouse/validate',
    process.env.WAREHOUSE_VALIDATION_BASE_URL ?? storefrontOrigin,
  );

  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))
    throw new WarehouseValidationError('Warehouse validation requires HTTPS.', 503, 'UNAVAILABLE');

  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

  return {
    endpoint: endpoint.href,
    token: signValidationClaims(
      { ...record, purpose: 'warehouse-validation', origin: checkoutOrigin, exp: expiresAt },
      signingSecret(),
    ),
    revision: record.revision,
    expiresAt,
  };
}

interface Checkout {
  id: string;
  order_id: number | null;
  cart: {
    id: string;
    channel_id: number;
    line_items: {
      physical_items: Array<{
        id: string;
        product_id: number;
        variant_id: number;
        quantity: number;
      }>;
    };
  };
  consignments: WarehouseConsignment[];
}

export async function validateWarehouseCheckout(
  token: string,
  origin: string,
  cartId: string,
  revision: string,
  requestedMode?: 'pickup' | 'shipping',
) {
  const claims = verifyValidationClaims(token, signingSecret(), origin);

  if (claims.storeHash !== process.env.BIGCOMMERCE_STORE_HASH || claims.cartId !== cartId)
    throw new WarehouseValidationError(
      'Checkout authorization does not match this cart.',
      401,
      'UNAUTHORIZED',
    );
  if (claims.revision !== revision)
    throw new WarehouseValidationError(
      'Checkout warehouse revision changed. Return to your cart.',
      409,
      'STALE_WAREHOUSE',
    );

  const record = await readWarehouseRecord(cartId);

  assertCurrentRecord(record, claims);

  const warehouse = getWarehouses().find((w) => w.id === record?.warehouseId);

  if (!warehouse)
    throw new WarehouseValidationError(
      'This warehouse is no longer available.',
      409,
      'WAREHOUSE_UNAVAILABLE',
    );
  if (requestedMode === 'shipping' && !warehouse.allowShipping)
    throw new WarehouseValidationError(
      'This warehouse supports pickup only.',
      409,
      'FULFILLMENT_CONFLICT',
    );

  const checkout = await warehouseApi<Checkout>(`checkouts/${encodeURIComponent(cartId)}`);

  if (
    checkout.id !== cartId ||
    checkout.cart.id !== cartId ||
    checkout.cart.channel_id !== claims.channelId ||
    checkout.order_id
  )
    throw new WarehouseValidationError(
      'This checkout is no longer available.',
      409,
      'CART_CHANGED',
    );

  const items = checkout.cart.line_items.physical_items;

  if (!items.length)
    throw new WarehouseValidationError(
      'Your cart is empty. Return to the storefront.',
      409,
      'CART_CHANGED',
    );
  await checkWarehouseStock(
    warehouse,
    items.map((item) => ({
      productEntityId: item.product_id,
      variantEntityId: item.variant_id,
      quantity: item.quantity,
    })),
  );

  // Unselected consignments are drafts, including pickup invalidated by a cart edit.
  // A preflight validates the target mode; ordinary checks validate the actual result.
  if (
    !requestedMode &&
    !warehouseFulfillmentCompatible(
      warehouse,
      items.map((item) => item.id),
      checkout.consignments,
    )
  ) {
    throw new WarehouseValidationError(
      'Checkout fulfillment does not match your cart warehouse. Return to your cart.',
      409,
      'FULFILLMENT_CONFLICT',
    );
  }

  assertCurrentRecord(await readWarehouseRecord(cartId), claims);

  return {
    version: 1,
    cartId,
    revision: record?.revision,
    warehouse,
    allowedModes: warehouse.allowShipping ? ['shipping', 'pickup'] : ['pickup'],
    expiresAt: claims.exp,
  };
}
