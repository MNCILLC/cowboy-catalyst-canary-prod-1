import 'server-only';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';

import { getChannelIdFromLocale } from '~/channels.config';
import { getCartId } from '~/lib/cart';

import { warehouseApi as api } from './api';
import { assertCurrentRecord, WarehouseValidationError } from './authorization';
import { getWarehouses, warehousePreviewEnabled } from './config';
import { readWarehouseRecord, saveWarehouseRecord } from './persistence';
import {
  assertStock,
  StockDemand,
  Warehouse,
  WarehouseConsignment,
  WarehouseError,
  warehouseFulfillmentCompatible,
} from './policy';

const COOKIE = 'shopping-warehouse';

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

async function cookieWarehouse() {
  const selected = (await cookies()).get(COOKIE)?.value;

  return getWarehouses().find((w) => w.id === selected);
}

export async function getWarehouseContext() {
  const cartId = await getCartId();
  const cart = await sessionCart(cartId);
  const record = cart ? await readWarehouseRecord(cart.id) : undefined;
  const warehouse = record
    ? getWarehouses().find((w) => w.id === record.warehouseId)
    : await cookieWarehouse();

  return { warehouse, cartId: cart?.id ?? null, revision: record?.revision ?? null };
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
  const warehouse = cart ? await warehouseForCart(cart) : await requireWarehouse();

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

  return warehouse;
}

async function warehouseForCart(cart: Cart) {
  let record = await readWarehouseRecord(cart.id);

  if (!record) {
    const selected = await cookieWarehouse();

    if (!selected)
      throw new WarehouseError('Choose your warehouse before adding items or checking out.');
    await checkWarehouseStock(selected, cart.line_items.physical_items.map(input));
    record = await saveWarehouseRecord(cart, selected.id, null);
  }

  if (
    record.storeHash !== process.env.BIGCOMMERCE_STORE_HASH ||
    record.cartId !== cart.id ||
    record.channelId !== cart.channel_id
  )
    throw new WarehouseError('Invalid cart warehouse.');

  const warehouse = getWarehouses().find((w) => w.id === record.warehouseId);

  if (!warehouse) throw new WarehouseError('Your selected warehouse is no longer available.');

  return warehouse;
}

export async function persistNewCartWarehouse(cartId: string, warehouseId: string) {
  const cart = await api<Cart>(`carts/${encodeURIComponent(cartId)}`);

  await saveWarehouseRecord(cart, warehouseId, null);
}

export async function selectWarehouse(
  id: string,
  expected: { cartId: string | null; revision: string | null },
) {
  const warehouse = getWarehouses().find((w) => w.id === id);

  if (!warehouse) throw new WarehouseError('Choose a valid warehouse.');

  const cart = await sessionCart(await getCartId());

  if ((cart?.id ?? null) !== expected.cartId)
    throw new WarehouseError(
      'Your cart changed in another tab. Reload before choosing a warehouse.',
    );

  if (cart) {
    const current = await readWarehouseRecord(cart.id);

    if ((current?.revision ?? null) !== expected.revision)
      throw new WarehouseError(
        'Your cart warehouse changed in another tab. Reload before choosing again.',
      );
    await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));
    await saveWarehouseRecord(cart, warehouse.id, expected.revision);
  }

  (await cookies()).set(COOKIE, warehouse.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function prepareWarehousePreview(cartId: string) {
  const cart = await sessionCart(cartId);

  if (!cart?.line_items.physical_items.length)
    throw new WarehouseError('Add a physical item first.');

  const warehouse = await warehouseForCart(cart);
  const record = await readWarehouseRecord(cart.id);

  if (!record) throw new WarehouseError('Choose your cart warehouse again.');
  await checkWarehouseStock(warehouse, cart.line_items.physical_items.map(input));
  assertCurrentRecord(await readWarehouseRecord(cart.id), record);

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

  assertCurrentRecord(await readWarehouseRecord(cart.id), record);

  return { record, warehouse };
}
