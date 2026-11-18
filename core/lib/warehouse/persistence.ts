import 'server-only';

import { randomUUID } from 'node:crypto';

import { warehouseApi } from './api';
import {
  assertCurrentRecord,
  recordSchema,
  WarehouseRecord,
  WarehouseValidationError,
} from './authorization';

const namespace = 'warehouse_checkout';
const key = 'selection_v1';

interface Metafield {
  id: number | string;
  value: string;
  permission_set: string;
}

async function field(cartId: string) {
  const fields = await warehouseApi<Metafield[]>(
    `carts/${encodeURIComponent(cartId)}/metafields?namespace=${namespace}&key=${key}&limit=250`,
  );

  if (fields.length > 1 || fields.some((f) => f.permission_set !== 'app_only'))
    throw new WarehouseValidationError(
      'Cart warehouse metadata is invalid. Please contact support.',
      409,
      'INVALID_RECORD',
    );

  return fields[0];
}

export async function readWarehouseRecord(cartId: string): Promise<WarehouseRecord | undefined> {
  const existing = await field(cartId);

  if (!existing) return undefined;

  try {
    const record = recordSchema.parse(JSON.parse(existing.value));

    if (record.cartId !== cartId || record.storeHash !== process.env.BIGCOMMERCE_STORE_HASH)
      throw new Error('Mismatched record');

    return record;
  } catch {
    throw new WarehouseValidationError(
      'Cart warehouse metadata is invalid. Please contact support.',
      409,
      'INVALID_RECORD',
    );
  }
}

export async function saveWarehouseRecord(
  cart: { id: string; channel_id: number },
  warehouseId: string,
  expectedRevision: string | null,
) {
  const existing = await field(cart.id);
  const current = existing ? recordSchema.parse(JSON.parse(existing.value)) : undefined;

  if ((current?.revision ?? null) !== expectedRevision)
    throw new WarehouseValidationError(
      'Your cart warehouse changed in another tab. Reload the storefront before choosing again.',
      409,
      'STALE_WAREHOUSE',
    );

  const record = recordSchema.parse({
    version: 1,
    storeHash: process.env.BIGCOMMERCE_STORE_HASH,
    channelId: cart.channel_id,
    cartId: cart.id,
    warehouseId,
    revision: randomUUID(),
  });

  await warehouseApi('carts/metafields', existing ? 'PUT' : 'POST', [
    {
      namespace,
      key,
      permission_set: 'app_only',
      value: JSON.stringify(record),
      ...(existing ? { id: Number(existing.id) } : { resource_id: cart.id }),
    },
  ]);
  // Detect a competing write visible at readback. This is not an atomic compare-and-swap.
  assertCurrentRecord(await readWarehouseRecord(cart.id), record);

  return record;
}
