import 'server-only';

import { findFirstAddCart, getSignedInWarehouseCustomerId } from '~/client/queries/get-customer';

import { warehouseApi } from './api';
import type { ShopperCartSlot } from './atomic/persistence';
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

export async function getShopperWarehouseCarts<Cart extends OwnedCart>(
  channelId: number,
  initializeCreated: (cart: Cart, warehouseId: string) => Promise<void>,
  active?: Cart,
) {
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

  async function resolveCartId(slot: NonNullable<ShopperCartSlot>) {
    if (typeof slot === 'string') return slot;
    if ('created' in slot) return slot.created;

    if ('uncertain' in slot) {
      const id = await findFirstAddCart(scope.customerId, slot.uncertain);

      if (id) return id;

      throw new WarehouseValidationError(
        'We could not verify the cart from your earlier add. Your warehouse cart is still reserved.',
        409,
        'CART_CHANGED',
      );
    }

    throw new WarehouseValidationError(
      'A cart is already being created for this warehouse. Reload your cart before adding again.',
      409,
      'CART_CHANGED',
    );
  }

  async function saved(warehouseId: string, observed?: ShopperCartSlot) {
    const slot = observed === undefined ? await storage.shopperCart(scope, warehouseId) : observed;

    if (!slot) return null;

    const id = await resolveCartId(slot);
    let cart: Cart;

    try {
      cart = await warehouseApi<Cart>(`carts/${encodeURIComponent(id)}`);
    } catch (error) {
      if (!(error instanceof WarehouseValidationError && error.status === 404)) throw error;

      // A missing recovery candidate cannot establish what happened to the original add.
      if (typeof slot === 'object' && 'uncertain' in slot) throw error;

      // BigCommerce deletes empty and converted carts. Only forget the ID we just checked.
      await storage.shopperCart(scope, warehouseId, { expected: slot, next: null });

      return null;
    }

    if (cart.id !== id || cart.customer_id !== customerId || cart.channel_id !== channelId)
      throw new WarehouseValidationError(
        'Unable to verify your saved warehouse cart.',
        409,
        'INVALID_RECORD',
      );

    // A previous request may have received the native ID but lost the initialization response.
    if (typeof slot !== 'string') {
      await initializeCreated(cart, warehouseId);
      await storage.shopperCart(scope, warehouseId, { expected: slot, next: id });

      return id;
    }

    const record = await readWarehouseRecord(id, channelId);

    if (
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

    const verified = previous && (await saved(warehouseId, previous));

    if (verified && verified === cartId) return true;
    if (verified)
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

  async function reserve(warehouseId: string) {
    const previous = await storage.shopperCart(scope, warehouseId);

    if (previous && typeof previous !== 'string' && 'uncertain' in previous) {
      const recoveredCartId = await saved(warehouseId, previous);

      if (!recoveredCartId) throw new Error('Unable to reopen your warehouse cart.');

      return { recoveredCartId };
    }

    // Check an existing pointer for expiry before trying to reserve the empty slot.
    if (typeof previous === 'string') await checkSlot(warehouseId);

    const reservation = { creating: crypto.randomUUID() };

    // A lost create response cannot safely be retried. Only the owning request can
    // release a known rejection or record the ID BigCommerce returned.
    await storage.shopperCart(scope, warehouseId, { expected: null, next: reservation });

    return {
      source: reservation.creating,
      markUncertain: () =>
        storage.shopperCart(scope, warehouseId, {
          expected: reservation,
          next: { uncertain: reservation.creating },
        }),
      release: () => storage.shopperCart(scope, warehouseId, { expected: reservation, next: null }),
      async complete(id: string) {
        await storage.shopperCart(scope, warehouseId, {
          expected: reservation,
          next: { created: id },
        });

        if ((await saved(warehouseId)) !== id)
          throw new WarehouseValidationError(
            'Your saved cart changed. Reload the cart.',
            409,
            'CART_CHANGED',
          );
      },
    };
  }

  return { saved, remember, checkSlot, reserve };
}
