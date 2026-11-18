import 'server-only';

import { cookies } from 'next/headers';

import { getCartId } from '~/lib/cart';

import { getWarehouses, warehousePreviewEnabled } from './config';
import { assertStock, StockDemand, Warehouse, WarehouseError } from './policy';

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

async function api<T>(path: string): Promise<T> {
  const hash = process.env.BIGCOMMERCE_STORE_HASH;
  const token = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!hash || !token) throw new WarehouseError('Warehouse verification is not configured.');

  const result = await fetch(`https://api.bigcommerce.com/stores/${hash}/v3/${path}`, {
    method: 'GET',
    headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!result.ok) throw new WarehouseError('Unable to verify warehouse inventory. Please retry.');

  // The caller checks inventory identity and stock values before admitting items.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const value: { data: T } = await result.json();

  return value.data;
}

export async function getWarehouseSelection() {
  const selected = (await cookies()).get(COOKIE)?.value;

  return getWarehouses().find((w) => w.id === selected);
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

  return api<Cart>(`carts/${encodeURIComponent(cartId)}`);
}

async function check(warehouse: Warehouse, items: Input[]) {
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

  const warehouse = await requireWarehouse();
  const cart = await sessionCart(cartId);

  if (
    replaceId &&
    ![...(cart?.line_items.physical_items ?? []), ...(cart?.line_items.digital_items ?? [])].some(
      (i) => i.id === replaceId,
    )
  )
    throw new WarehouseError('This cart item no longer exists.');
  await check(warehouse, [
    ...(cart?.line_items.physical_items ?? []).filter((i) => i.id !== replaceId).map(input),
    ...items,
  ]);
}

export async function selectWarehouse(id: string) {
  const warehouse = getWarehouses().find((w) => w.id === id);

  if (!warehouse) throw new WarehouseError('Choose a valid warehouse.');

  const cart = await sessionCart(await getCartId());

  await check(warehouse, (cart?.line_items.physical_items ?? []).map(input));
  (await cookies()).set(COOKIE, warehouse.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function prepareWarehousePreview(cartId: string) {
  const warehouse = await requireWarehouse();
  const cart = await sessionCart(cartId);

  if (!cart?.line_items.physical_items.length)
    throw new WarehouseError('Add a physical test item first.');
  await check(warehouse, cart.line_items.physical_items.map(input));

  return {
    protocol: 'warehouse-preview-v1',
    warehouseCheckout: { version: 1, cartId: cart.id, warehouse, preview: true },
  };
}
