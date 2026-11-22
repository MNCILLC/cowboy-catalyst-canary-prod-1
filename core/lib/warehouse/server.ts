import 'server-only';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

import { getChannelIdFromLocale } from '~/channels.config';
import { getCartId } from '~/lib/cart';

import { warehouseApi as api } from './api';
import { assertCurrentRecord, WarehouseValidationError } from './authorization';
import { warehousePreviewEnabled } from './config';
import { getEnabledWarehouses } from './locations';
import {
  findWarehouseOperation,
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
  WarehouseConsignment,
  WarehouseError,
  warehouseFulfillmentCompatible,
} from './policy';

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

  // A cart created before activation needs its own explicit, stock-checked selection.
  if (cart && !record && warehousePersistenceIsAtomic())
    return { warehouse: undefined, cartId: cart.id, revision: null };

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

export async function assertWarehouseItems(items: Input[], cartId?: string, replaceId?: string) {
  if (!warehousePreviewEnabled()) return;

  const cart = await sessionCart(cartId);
  const persisted = cart ? await warehouseForCart(cart) : undefined;
  const warehouse = persisted?.warehouse ?? (await requireWarehouse());

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
  let record = await readWarehouseRecord(cart.id, cart.channel_id);

  if (!record) {
    if (warehousePersistenceIsAtomic())
      throw new WarehouseValidationError(
        'Choose a warehouse to check availability for the items already in your cart.',
        409,
        'WAREHOUSE_RECOVERY_REQUIRED',
      );

    const selected = await cookieWarehouse(await getEnabledWarehouses());

    if (!selected)
      throw new WarehouseError('Choose your warehouse before adding items or checking out.');
    await checkWarehouseStock(selected, cart.line_items.physical_items.map(input));
    record = await saveWarehouseRecord(cart, selected.id, null, cart.id);
  }

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

// Called only by the successful new-cart creation callback; never adopt an existing cart here.
export async function persistNewCartWarehouse(cartId: string, warehouseId: string) {
  const cart = await api<Cart>(`carts/${encodeURIComponent(cartId)}`);
  const warehouse = (await getEnabledWarehouses()).find((w) => w.id === warehouseId);

  if (
    !warehouse ||
    cart.id !== cartId ||
    cart.channel_id !== Number(getChannelIdFromLocale(await getLocale()))
  )
    throw new WarehouseError('Invalid new cart warehouse.');
  // Reserve the cart UUID for initialization so a lost response can be retried safely.
  if (await findWarehouseOperation(cart, warehouseId, null, cart.id)) return;
  await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));
  await saveWarehouseRecord(cart, warehouseId, null, cart.id);
}

export async function selectWarehouse(
  id: string,
  expected: { cartId: string | null; revision: string | null; operationId: string },
) {
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

  let selectedId = warehouse.id;

  if (cart) {
    // Authenticate first, then recover a committed request before stale/stock checks.
    const accepted = await findWarehouseOperation(
      cart,
      warehouse.id,
      expected.revision,
      expected.operationId,
    );

    if (accepted) {
      selectedId = accepted.warehouseId;
    } else {
      const current = await readWarehouseRecord(cart.id, cart.channel_id);

      if ((current?.revision ?? null) !== expected.revision)
        throw new WarehouseValidationError(
          'Your cart warehouse changed in another tab. Reload before choosing again.',
          409,
          'STALE_WAREHOUSE',
        );
      await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));

      if (!current && warehousePersistenceIsAtomic()) {
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

      selectedId = record.warehouseId;
    }
  } else {
    // Validate the provider even for a pre-cart preference; never hide invalid activation.
    warehousePersistenceIsAtomic();
  }

  if (!warehouses.some((w) => w.id === selectedId))
    throw new WarehouseError('Your selected warehouse is no longer available.');

  (await cookies()).set(COOKIE, selectedId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function authorizeWarehouseInitialization(cartId: string) {
  const cart = await sessionCart(cartId);

  if (!cart?.line_items.physical_items.length)
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

  return { record, warehouse };
}
