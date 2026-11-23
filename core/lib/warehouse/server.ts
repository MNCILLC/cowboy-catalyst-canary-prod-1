import 'server-only';

import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

import { getChannelIdFromLocale } from '~/channels.config';
import { clearCartId, getCartId, setCartId } from '~/lib/cart';

import { warehouseApi as api } from './api';
import {
  assertCurrentRecord,
  type WarehouseRecord,
  WarehouseValidationError,
} from './authorization';
import { automaticInitializationEnabled, getWarehouses, warehousePreviewEnabled } from './config';
import { getEnabledWarehouses } from './locations';
import {
  findWarehouseOperation,
  getAtomicWarehousePersistence,
  readWarehouseRecord,
  saveWarehouseRecord,
  warehousePersistenceIsAtomic,
} from './persistence';
import { preparePickupOnlyHandoff } from './pickup-handoff';
import {
  assertStock,
  getShippingOriginWarehouse,
  StockDemand,
  Warehouse,
  warehouseCartKey,
  WarehouseConsignment,
  WarehouseError,
  warehouseFulfillmentCompatible,
} from './policy';
import {
  getShopperWarehouseCarts,
  type LoginCart,
  readOwnedCart,
  shopperScope,
} from './shopper-carts';

const COOKIE = 'shopping-warehouse';

const selectionContextSchema = z
  .object({
    cartId: z.string().uuid().nullable(),
    revision: z.string().uuid().nullable(),
    operationId: z.string().uuid(),
  })
  .strict();

interface Input {
  productEntityId?: number | null;
  variantEntityId?: number | null;
  quantity: number;
  selectedOptions?: {
    multipleChoices?: Array<{ optionEntityId: number; optionValueEntityId: number }> | null;
  } | null;
}

interface Item {
  id: string;
  product_id: number;
  variant_id: number;
  quantity: number;
  name: string;
}

interface Cart {
  id: string;
  customer_id: number;
  version?: number;
  channel_id: number;
  line_items: { physical_items: Item[]; digital_items: Item[] };
}

interface Variant {
  id: number;
  option_values: Array<{ option_id: number; id: number }>;
}

interface Product {
  id: number;
  name: string;
  type: string;
  inventory_tracking: string;
  variants: Variant[];
}

interface Inventory {
  identity: { product_id: number; variant_id: number | null };
  available_to_sell: number;
}

async function cookieWarehouse(warehouses: Warehouse[]) {
  const selected = (await cookies()).get(COOKIE)?.value;

  return warehouses.find((w) => w.id === selected);
}

export async function getWarehouseContext() {
  const cartId = await getCartId();
  const cart = await sessionCart(cartId);
  const record = cart ? await readWarehouseRecord(cart.id, cart.channel_id) : undefined;

  // Let the picker check the cart before assigning it. A browsing cookie is only a preference.
  if (cart && !record)
    return {
      warehouse: undefined,
      cartId: cart.id,
      revision: null,
      recoveryCartVersion: cart.version,
    };

  const warehouses = await getEnabledWarehouses();
  const warehouse = record
    ? warehouses.find((w) => w.id === record.warehouseId)
    : await cookieWarehouse(warehouses);

  return {
    warehouse: warehouse ?? (cart ? undefined : getShippingOriginWarehouse(warehouses)),
    cartId: cart?.id ?? null,
    revision: record?.revision ?? null,
  };
}

export async function getWarehouseSelection() {
  return (await getWarehouseContext()).warehouse;
}

async function requireWarehouse() {
  const warehouse = await getWarehouseSelection();

  if (!warehouse)
    throw new WarehouseError('Choose your warehouse above before adding items or checking out.');

  return warehouse;
}

async function sessionCart(cartId?: string): Promise<Cart | undefined> {
  if (!cartId) return undefined;
  if (cartId !== (await getCartId()))
    throw new WarehouseError('Your cart changed. Reload the page.');

  let cart: Cart;

  try {
    cart = await api<Cart>(`carts/${encodeURIComponent(cartId)}`);
  } catch (error) {
    if (error instanceof WarehouseValidationError && error.status === 404) return undefined;
    throw error;
  }

  if (cart.channel_id !== Number(getChannelIdFromLocale(await getLocale())))
    throw new WarehouseError('This cart belongs to another storefront.');

  return cart;
}

export async function checkWarehouseStock(warehouse: Warehouse, items: Input[]) {
  const products = new Map<number, Product>();

  await Promise.all(
    [...new Set(items.map((i) => i.productEntityId))].map(async (id) => {
      if (!id || !Number.isSafeInteger(id))
        throw new WarehouseError('Unable to identify this product.');
      products.set(id, await api<Product>(`catalog/products/${id}?include=variants`));
    }),
  );

  const demands: StockDemand[] = [];
  const available = new Map<string, number>();

  await Promise.all(
    [...products.values()].map(async (p) => {
      if (p.type !== 'physical') return;
      if (!['product', 'variant'].includes(p.inventory_tracking))
        throw new WarehouseError(
          `${p.name}: location inventory tracking is required for this preview.`,
        );

      // Product filtering can span several pages for products with many variants.
      for (let page = 1; ; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const stock = await api<Inventory[]>(
          `inventory/locations/${warehouse.locationId}/items?product_id:in=${p.id}&limit=250&page=${page}`,
        );

        stock.forEach((row) => {
          if (row.identity.product_id !== p.id) return;
          available.set(
            p.inventory_tracking === 'product' ? `p:${p.id}` : `v:${row.identity.variant_id}`,
            row.available_to_sell,
          );
        });
        if (stock.length < 250) break;
      }
    }),
  );
  items.forEach((item) => {
    const p = products.get(item.productEntityId ?? 0);

    if (!p) throw new WarehouseError('Unable to identify this product.');
    if (p.type !== 'physical') return;

    let variantId = item.variantEntityId;

    if (variantId && !p.variants.some((v) => v.id === variantId))
      throw new WarehouseError('Invalid product variant.');

    if (p.inventory_tracking === 'variant') {
      const choices = item.selectedOptions?.multipleChoices ?? [];
      const matches = p.variants.filter(
        (v) =>
          (!variantId || v.id === variantId) &&
          v.option_values.every((option) =>
            choices.some(
              (c) => c.optionEntityId === option.option_id && c.optionValueEntityId === option.id,
            ),
          ),
      );

      // Existing cart lines have an authoritative variant ID and no option inputs.
      if (!variantId || choices.length) {
        if (matches.length !== 1)
          throw new WarehouseError('Choose a complete product variant before adding it.');
        variantId = matches[0]?.id;
      }

      if (!variantId) throw new WarehouseError('Unable to verify product variant inventory.');
    }

    demands.push({
      key: p.inventory_tracking === 'product' ? `p:${p.id}` : `v:${variantId}`,
      name: p.name,
      quantity: item.quantity,
    });
  });
  assertStock(demands, available, warehouse.label);
}

const input = (i: Item): Input => ({
  productEntityId: i.product_id,
  variantEntityId: i.variant_id,
  quantity: i.quantity,
});

export async function assertWarehouseItems(
  items: Input[],
  cartId?: string,
  { replaceId, displayedCart }: { replaceId?: string; displayedCart?: string | null } = {},
) {
  if (!warehousePreviewEnabled()) return;

  const cart = await sessionCart(cartId);
  const persisted = cart ? await warehouseForCart(cart) : undefined;
  const warehouse = persisted?.warehouse ?? (await requireWarehouse());

  if (
    displayedCart !== undefined &&
    displayedCart !== warehouseCartKey(cart?.id ?? null, warehouse.id)
  ) {
    const t = await getTranslations('Cart.Errors');

    throw new WarehouseValidationError(t('activeCartChanged'), 409, 'STALE_WAREHOUSE');
  }

  if (
    replaceId &&
    ![...(cart?.line_items.physical_items ?? []), ...(cart?.line_items.digital_items ?? [])].some(
      (i) => i.id === replaceId,
    )
  )
    throw new WarehouseError('This cart item no longer exists.');
  await checkWarehouseStock(warehouse, [
    ...(cart?.line_items.physical_items ?? []).filter((i) => i.id !== replaceId).map(input),
    ...items,
  ]);

  if (cart && persisted)
    assertCurrentRecord(await readWarehouseRecord(cart.id, cart.channel_id), persisted.record);

  return warehouse;
}

async function warehouseForCart(cart: Cart) {
  const record = await readWarehouseRecord(cart.id, cart.channel_id);

  if (!record)
    throw new WarehouseValidationError(
      'Check warehouse availability for the items in your cart before continuing.',
      409,
      'WAREHOUSE_RECOVERY_REQUIRED',
    );

  if (
    record.storeHash !== process.env.BIGCOMMERCE_STORE_HASH ||
    record.cartId !== cart.id ||
    record.channelId !== cart.channel_id
  )
    throw new WarehouseError('Invalid cart warehouse.');

  const warehouse = (await getEnabledWarehouses()).find((w) => w.id === record.warehouseId);

  if (!warehouse) throw new WarehouseError('Your selected warehouse is no longer available.');

  return { record, warehouse };
}

export async function recoverLoginWarehouseCart(
  customerId: number,
  candidate: LoginCart | null | undefined,
  channelId?: string,
) {
  if (!warehousePreviewEnabled() || !warehousePersistenceIsAtomic()) return;

  const scope = shopperScope(
    Number(channelId ?? getChannelIdFromLocale(await getLocale())),
    customerId,
  );
  const storage = await getAtomicWarehousePersistence();
  const slots = await Promise.all(
    getWarehouses().map(async ({ id: warehouseId }) => ({
      warehouseId,
      slot: await storage.shopperCart(scope, warehouseId),
    })),
  );
  const pending = slots.flatMap(({ warehouseId, slot }) =>
    slot && typeof slot === 'object' ? [{ warehouseId, slot }] : [],
  );
  const match =
    candidate &&
    pending.find(({ slot }) => {
      if ('created' in slot) return slot.created === candidate.entityId;

      const source = 'creating' in slot ? slot.creating : slot.uncertain;

      return source === candidate.externalSource;
    });

  // A still-running first add owns its reservation until it completes or reports a lost response.
  if (match && !('creating' in match.slot)) {
    const cart = await readOwnedCart<Cart>(candidate.entityId, scope);

    await initializeCreatedCart(cart, match.warehouseId);
    await storage.shopperCart(scope, match.warehouseId, { expected: match.slot, next: cart.id });

    await selectHandoffWarehouse(scope, match.warehouseId);
    await setWarehouseCookie(match.warehouseId);

    return { cartId: cart.id };
  }

  if (!pending.length) return;

  const selected = (await cookies()).get(COOKIE)?.value;

  if (
    !match &&
    candidate &&
    slots.some(({ warehouseId, slot }) => warehouseId === selected && slot === candidate.entityId)
  )
    return;

  const unresolved =
    match ?? pending.find(({ warehouseId }) => warehouseId === selected) ?? pending[0];

  if (unresolved) {
    await selectHandoffWarehouse(scope, unresolved.warehouseId);
    await setWarehouseCookie(unresolved.warehouseId);

    return { cartId: null };
  }
}

export async function reserveNewCartWarehouse(warehouseId: string) {
  const channelId = Number(getChannelIdFromLocale(await getLocale()));
  const carts = await getShopperWarehouseCarts(channelId, initializeCreatedCart);

  return carts?.reserve(warehouseId);
}

async function initializeCreatedCart(cart: Cart, warehouseId: string) {
  const warehouse = (await getEnabledWarehouses()).find((w) => w.id === warehouseId);

  if (!warehouse || cart.channel_id !== Number(getChannelIdFromLocale(await getLocale())))
    throw new WarehouseError('Invalid new cart warehouse.');

  const accepted = await findWarehouseOperation(cart, warehouseId, null, cart.id);

  if (accepted) {
    if (accepted.warehouseId !== warehouseId)
      throw new WarehouseError('Invalid new cart warehouse.');

    return;
  }

  await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));
  await saveWarehouseRecord(cart, warehouseId, null, cart.id);
}

// Used when creating without a signed-in shopper reservation.
export async function persistNewCartWarehouse(cartId: string, warehouseId: string) {
  const cart = await api<Cart>(`carts/${encodeURIComponent(cartId)}`);

  if (cart.id !== cartId) throw new WarehouseError('Invalid new cart warehouse.');

  const carts = await getShopperWarehouseCarts(cart.channel_id, initializeCreatedCart, cart);

  await initializeCreatedCart(cart, warehouseId);
  await carts?.remember(warehouseId, cart);
}

type SelectionContext = z.infer<typeof selectionContextSchema>;

async function assignWarehouse(cart: Cart, warehouse: Warehouse, expected: SelectionContext) {
  // Authenticate first, then recover a committed request before stale/stock checks.
  const accepted = await findWarehouseOperation(
    cart,
    warehouse.id,
    expected.revision,
    expected.operationId,
  );

  if (accepted) return accepted.warehouseId;

  const current = await readWarehouseRecord(cart.id, cart.channel_id);

  if ((current?.revision ?? null) !== expected.revision)
    throw new WarehouseValidationError(
      'Your cart warehouse changed in another tab. Reload before choosing again.',
      409,
      'STALE_WAREHOUSE',
    );
  await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));

  if (!current) {
    const latest = await sessionCart(cart.id);

    if (!isDeepStrictEqual(latest?.line_items, cart.line_items))
      throw new WarehouseValidationError(
        'Your cart changed while checking stock. Review your cart and choose a warehouse again.',
        409,
        'CART_CHANGED',
      );
  }

  const record = await saveWarehouseRecord(
    cart,
    warehouse.id,
    expected.revision,
    expected.operationId,
  );

  return record.warehouseId;
}

async function switchShopperCart(
  carts: NonNullable<Awaited<ReturnType<typeof getShopperWarehouseCarts>>>,
  id: string,
  expected: SelectionContext,
  cart?: Cart,
  assigned?: WarehouseRecord,
) {
  if (expected.revision !== (assigned?.revision ?? null)) {
    // An unassigned cart may already have been recovered by this same request.
    const receipt =
      cart && (await findWarehouseOperation(cart, id, expected.revision, expected.operationId));

    if (!receipt || receipt.revision !== assigned?.revision || receipt.warehouseId !== id)
      throw new WarehouseValidationError(
        'Your cart warehouse changed. Reload before choosing again.',
        409,
        'STALE_WAREHOUSE',
      );
  }

  // An assigned cart stays with its warehouse. A warehouse with no saved cart
  // starts empty and gets a native cart ID when its first item is added.
  if (cart && assigned) await carts.remember(assigned.warehouseId, cart);

  const target = await carts.saved(id);

  await selectHandoffWarehouse(carts.scope, id);
  if (target === ((await getCartId()) ?? null)) return false;
  if (target) await setCartId(target);
  else await clearCartId();

  return true;
}

async function selectHandoffWarehouse(scope: ReturnType<typeof shopperScope>, warehouseId: string) {
  if (!automaticInitializationEnabled()) return;

  const storage = await getAtomicWarehousePersistence();

  await storage.initializationHandoff(scope, { type: 'switch', warehouseId });
}

async function setWarehouseCookie(id: string) {
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function selectWarehouse(id: string, expected: SelectionContext) {
  if (!selectionContextSchema.safeParse(expected).success)
    throw new WarehouseValidationError(
      'Invalid warehouse selection request.',
      400,
      'INVALID_SELECTION_REQUEST',
    );

  const warehouses = await getEnabledWarehouses();
  const warehouse = warehouses.find((w) => w.id === id);

  if (!warehouse)
    throw new WarehouseError('This warehouse is unavailable. Choose another warehouse.');

  const cart = await sessionCart(await getCartId());

  if ((cart?.id ?? null) !== expected.cartId)
    throw new WarehouseValidationError(
      'Your cart changed in another tab. Reload before choosing a warehouse.',
      409,
      'CART_CHANGED',
    );

  const channelId = cart?.channel_id ?? Number(getChannelIdFromLocale(await getLocale()));
  const carts = await getShopperWarehouseCarts(channelId, initializeCreatedCart, cart);
  const assigned = cart && carts ? await readWarehouseRecord(cart.id, channelId) : undefined;
  let selectedId = warehouse.id;
  let cartSwitched = false;

  if (carts && (assigned || !cart)) {
    cartSwitched = await switchShopperCart(carts, id, expected, cart, assigned);
  } else if (cart) {
    // Keep a legacy cart unassigned if the shopper already has a cart at this warehouse.
    await carts?.checkSlot(id, cart.id);
    selectedId = await assignWarehouse(cart, warehouse, expected);
    await carts?.remember(selectedId, cart);
    if (carts) await selectHandoffWarehouse(carts.scope, selectedId);
  }

  if (!warehouses.some((w) => w.id === selectedId))
    throw new WarehouseError('Your selected warehouse is no longer available.');

  await setWarehouseCookie(selectedId);

  return cartSwitched;
}

export async function authorizeWarehouseInitialization(cartId: string) {
  const cart = await sessionCart(cartId);

  if (!cart) throw new WarehouseError('Add a physical item first.');

  return verifyWarehouseCart(cart);
}

export async function authorizeOwnedWarehouseCart(
  cartId: string,
  scope: ReturnType<typeof shopperScope>,
) {
  return verifyWarehouseCart(await readOwnedCart<Cart>(cartId, scope));
}

async function verifyWarehouseCart(cart: Cart) {
  if (!cart.line_items.physical_items.length)
    throw new WarehouseError('Add a physical item first.');

  // Resolve both from the same read: a concurrent selection must not mix revisions and warehouses.
  const { record, warehouse } = await warehouseForCart(cart);

  await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));
  assertCurrentRecord(await readWarehouseRecord(cart.id, cart.channel_id), record);

  return { cart, record, warehouse };
}

export async function prepareWarehousePreview(cartId: string) {
  const { cart, record, warehouse } = await authorizeWarehouseInitialization(cartId);
  const checkout = await api<{ consignments: WarehouseConsignment[] }>(
    `checkouts/${encodeURIComponent(cartId)}`,
  );

  if (
    !warehouseFulfillmentCompatible(
      warehouse,
      cart.line_items.physical_items.map((item) => item.id),
      checkout.consignments,
    )
  ) {
    // A new, session-authorized handoff resets fulfillment that belongs to the old warehouse.
    // eslint-disable-next-line no-restricted-syntax
    for (const consignment of checkout.consignments) {
      // Native consignment mutations must be sequential.
      // eslint-disable-next-line no-await-in-loop
      await api(
        `checkouts/${encodeURIComponent(cartId)}/consignments/${encodeURIComponent(consignment.id)}`,
        'DELETE',
      );
    }
  }

  await preparePickupOnlyHandoff(cartId, cart.line_items.physical_items, warehouse, async () => {
    assertCurrentRecord(await readWarehouseRecord(cart.id, cart.channel_id), record);
  });
  assertCurrentRecord(await readWarehouseRecord(cart.id, cart.channel_id), record);

  return { cart, record, warehouse };
}
