import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { applyLocationInventory, getLocationProductInventory } from './get-location-inventory.ts';

const product = {
  entityId: 42,
  sku: 'test-sku',
  inventory: {
    isStockTracked: true,
    hasVariantInventory: false,
    isInStock: true,
    aggregated: {
      availableToSell: 100,
      availableOnHand: 100,
      warningLevel: 10,
      availableForBackorder: 20,
      unlimitedBackorder: true,
    },
  },
};

const item = (count: number, sku = product.sku) => ({
  identity: { product_id: product.entityId, sku },
  available_to_sell: count,
  settings: { is_in_stock: true, warning_level: 2 },
});

test('selected-location quantity and warning level replace the default location without mutation', () => {
  const [selected] = applyLocationInventory([product], [item(3)]);
  assert.equal(selected?.inventory.aggregated.availableToSell, 3);
  assert.equal(selected?.inventory.aggregated.warningLevel, 2);
  assert.equal(selected?.inventory.aggregated.availableForBackorder, 0);
  assert.equal(product.inventory.aggregated.availableToSell, 100);
});

test('missing, disabled, and zero stock never fall back to default-location stock', () => {
  for (const items of [
    [],
    [item(0)],
    [{ ...item(8), settings: { ...item(8).settings, is_in_stock: false } }],
  ]) {
    assert.equal(applyLocationInventory([product], items)[0]?.inventory.isInStock, false);
  }
  assert.equal(
    applyLocationInventory([product], [item(8, 'different-sku')])[0]?.inventory.isInStock,
    false,
  );
});

test('local stock can be available even when the default location is out of stock', () => {
  const result = applyLocationInventory(
    [{ ...product, inventory: { ...product.inventory, isInStock: false } }],
    [item(4)],
  );
  assert.equal(result[0]?.inventory.isInStock, true);
});

test('variant cards use local availability without exposing an arbitrary variant count', () => {
  const result = applyLocationInventory(
    [{ ...product, inventory: { ...product.inventory, hasVariantInventory: true } }],
    [item(0, 'variant-a'), item(4, 'variant-b')],
  );
  assert.equal(result[0]?.inventory.isInStock, true);
  assert.equal(result[0]?.inventory.aggregated, null);
});

test('untracked products retain their original availability', () => {
  const untracked = { ...product, inventory: { ...product.inventory, isStockTracked: false } };
  assert.equal(applyLocationInventory([untracked], [])[0], untracked);
});

test('API requests use the selected location, batch product IDs, and read all pages without caching', async (t) => {
  setTestCredentials(t);
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, options: RequestInit) => {
    const url = new URL(input);
    requests.push(url);
    assert.equal(url.pathname, '/stores/test-store/v3/inventory/locations/7/items');
    assert.equal(url.searchParams.get('product_id:in'), '42,43');
    assert.equal(options.cache, 'no-store');
    return Response.json({
      data: [item(requests.length)],
      meta: { pagination: { total_pages: 2 } },
    });
  });
  const result = await getLocationProductInventory(7, [42, 43, 42]);
  assert.deepEqual(
    requests.map((url) => url.searchParams.get('page')),
    ['1', '2'],
  );
  assert.deepEqual(
    result.map((row) => row.available_to_sell),
    [1, 2],
  );
});

test('failed inventory requests surface an error instead of returning default inventory', async (t) => {
  setTestCredentials(t);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  await assert.rejects(getLocationProductInventory(7, [42]), /403/);
});

function setTestCredentials(t: TestContext) {
  const keys = ['BIGCOMMERCE_ACCESS_TOKEN', 'BIGCOMMERCE_STORE_HASH'] as const;
  const previous = keys.map((key) => process.env[key]);
  process.env.BIGCOMMERCE_ACCESS_TOKEN = 'test-token';
  process.env.BIGCOMMERCE_STORE_HASH = 'test-store';
  t.after(() => {
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
}
