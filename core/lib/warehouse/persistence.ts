import 'server-only';

import { WarehouseValidationError } from './authorization';
import { warehousePreviewEnabled } from './config';

// Preview and staging are opt-in; staging configuration requires Redis. Never fall back after a Redis failure.
export function warehousePersistenceIsAtomic() {
  const enabled = warehousePreviewEnabled();
  const provider = process.env.WAREHOUSE_PERSISTENCE_PROVIDER ?? 'metafield';

  if (provider === 'metafield') return false;
  if (provider === 'redis' && enabled) return true;
  throw new WarehouseValidationError(
    'Warehouse persistence is not configured for this environment.',
    503,
    'WAREHOUSE_STORAGE_UNAVAILABLE',
  );
}

export async function getAtomicWarehousePersistence() {
  const { createUpstashWarehousePersistence } = await import('./atomic/upstash');

  try {
    return createUpstashWarehousePersistence({
      url: process.env.WAREHOUSE_REDIS_URL ?? '',
      token: process.env.WAREHOUSE_REDIS_TOKEN ?? '',
      namespace: process.env.WAREHOUSE_REDIS_NAMESPACE ?? '',
    });
  } catch {
    throw new WarehouseValidationError(
      'Warehouse storage is not configured.',
      503,
      'WAREHOUSE_STORAGE_UNAVAILABLE',
    );
  }
}

function scope(cartId: string, channelId: number) {
  return { storeHash: process.env.BIGCOMMERCE_STORE_HASH ?? '', channelId, cartId };
}

export async function readWarehouseRecord(cartId: string, channelId: number) {
  if (warehousePersistenceIsAtomic())
    return (await getAtomicWarehousePersistence()).read(scope(cartId, channelId));

  const legacy = await import('./metafield-persistence');
  const record = await legacy.readWarehouseRecord(cartId);

  if (record && record.channelId !== channelId)
    throw new WarehouseValidationError('Invalid cart warehouse.', 409, 'INVALID_RECORD');

  return record;
}

export async function findWarehouseOperation(
  cart: { id: string; channel_id: number },
  warehouseId: string,
  expectedRevision: string | null,
  operationId: string,
) {
  if (!warehousePersistenceIsAtomic()) return undefined;

  const receipt = await (
    await getAtomicWarehousePersistence()
  ).lookupOperation({
    ...scope(cart.id, cart.channel_id),
    warehouseId,
    expectedRevision,
    operationId,
  });

  return receipt?.currentRecord;
}

export async function saveWarehouseRecord(
  cart: { id: string; channel_id: number },
  warehouseId: string,
  expectedRevision: string | null,
  operationId: string,
) {
  if (warehousePersistenceIsAtomic()) {
    const receipt = await (
      await getAtomicWarehousePersistence()
    ).compareAndSet({
      ...scope(cart.id, cart.channel_id),
      warehouseId,
      expectedRevision,
      operationId,
    });

    return receipt.currentRecord;
  }

  const legacy = await import('./metafield-persistence');

  return legacy.saveWarehouseRecord(cart, warehouseId, expectedRevision);
}
