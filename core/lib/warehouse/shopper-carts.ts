import 'server-only';

import { getSignedInWarehouseCustomerId } from '~/client/queries/get-customer';

import { warehouseApi } from './api';
import { WarehouseValidationError } from './authorization';
import {
  getAtomicWarehousePersistence,
  readWarehouseRecord,
  warehousePersistenceIsAtomic,
} from './persistence';

interface OwnedCart {
  id: string;
  customer_id: number;
  channel_id: number;
}

export async function getShopperWarehouseCarts(channelId: number, active?: OwnedCart) {
  if (!warehousePersistenceIsAtomic()) return;

  const customerId = await getSignedInWarehouseCustomerId();

  if (!customerId && !active?.customer_id) return;
  if (!customerId || (active && active.customer_id !== customerId))
    throw new WarehouseValidationError(
      'Sign in again to access your warehouse carts.',
      403,
      'CART_OWNER_CHANGED',
    );

  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;

  if (!storeHash) throw new Error('Warehouse store is unavailable.');

  const scope = { storeHash, channelId, customerId };
  const storage = await getAtomicWarehousePersistence();

  async function saved(warehouseId: string) {
    const id = await storage.shopperCart(scope, warehouseId);

    if (!id) return null;

    let cart: OwnedCart;

    try {
      cart = await warehouseApi<OwnedCart>(`carts/${id}`);
    } catch (error) {
      if (!(error instanceof WarehouseValidationError && error.status === 404)) throw error;

      // BigCommerce deletes empty and converted carts. Only forget the ID we just checked.
      return storage.shopperCart(scope, warehouseId, { expected: id, next: null });
    }

    const record = await readWarehouseRecord(id, channelId);

    if (
      cart.id !== id ||
      cart.customer_id !== customerId ||
      cart.channel_id !== channelId ||
      record?.warehouseId !== warehouseId ||
      record.cartId !== id ||
      record.storeHash !== storeHash
    )
      throw new WarehouseValidationError(
        'Unable to verify your saved warehouse cart.',
        409,
        'INVALID_RECORD',
      );

    return id;
  }

  async function checkSlot(warehouseId: string, cartId?: string) {
    const previous = await storage.shopperCart(scope, warehouseId);

    if (previous === cartId) return true;
    if (previous && (await saved(warehouseId)))
      throw new WarehouseValidationError(
        'You already have a saved cart at this warehouse. Select another warehouse to keep both carts.',
        409,
        'CART_CHANGED',
      );

    return false;
  }

  async function remember(warehouseId: string, cart: OwnedCart) {
    if (cart.customer_id !== customerId || cart.channel_id !== channelId)
      throw new WarehouseValidationError(
        'Unable to verify cart ownership.',
        403,
        'CART_OWNER_CHANGED',
      );
    if (await checkSlot(warehouseId, cart.id)) return;

    await storage.shopperCart(scope, warehouseId, { expected: null, next: cart.id });
  }

  return { saved, remember, checkSlot };
}
