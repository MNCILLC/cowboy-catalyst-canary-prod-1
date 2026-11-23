const assert = require('node:assert/strict');
const { test } = require('node:test');
const zod = require('zod');

const { loadTestModule } = require('../warehouse/mode-test-support.cjs');

const policy = loadTestModule('policy.ts', {});
const authorization = loadTestModule('authorization.ts', {
  'node:crypto': require('node:crypto'),
  './policy': policy,
  zod,
});

function fixture(cartId, enabled = true) {
  const warehouse = { id: 'powell', locationId: 2 };
  const cart = { id: cartId, channel_id: 37, line_items: { physical_items: [] } };
  const server = loadTestModule('server.ts', {
    'server-only': {},
    'next/headers': { cookies: async () => ({ get: () => ({ value: warehouse.id }) }) },
    'next-intl/server': { getLocale: async () => 'en', getTranslations: async () => (key) => key },
    'node:util': require('node:util'),
    zod,
    '~/channels.config': { getChannelIdFromLocale: () => cart.channel_id },
    '~/lib/cart': { getCartId: async () => cartId },
    './api': {
      warehouseApi: async (path) => {
        if (cartId && path === `carts/${cartId}`) return cart;
        if (path === 'catalog/products/51?include=variants')
          return { id: 51, type: 'physical', inventory_tracking: 'product', variants: [] };
        if (path.startsWith('inventory/locations/2/items?'))
          return [{ identity: { product_id: 51 }, available_to_sell: 1 }];
        throw new Error(`Unexpected test request ${path}`);
      },
    },
    './authorization': authorization,
    './config': { warehousePreviewEnabled: () => enabled },
    './locations': { getEnabledWarehouses: async () => [warehouse] },
    './persistence': {
      readWarehouseRecord: async () => ({
        storeHash: process.env.BIGCOMMERCE_STORE_HASH,
        channelId: cart.channel_id,
        cartId,
        warehouseId: warehouse.id,
        revision: 'r1',
      }),
    },
    './pickup-handoff': {},
    './policy': policy,
    './shopper-carts': { getShopperWarehouseCarts: async () => undefined },
  });

  return (displayedCart) =>
    server.assertWarehouseItems([{ productEntityId: 51, quantity: 1 }], cartId, { displayedCart });
}

test('adding checks the displayed cart ID and warehouse independently', async () => {
  const check = fixture('cart-b');
  const stale = { message: 'activeCartChanged', code: 'STALE_WAREHOUSE' };

  await assert.rejects(check(policy.warehouseCartKey('cart-a', 'powell')), stale);
  await assert.rejects(check(policy.warehouseCartKey('cart-b', 'forney')), stale);
  await assert.rejects(check(null), stale);
  assert.equal((await check(policy.warehouseCartKey('cart-b', 'powell'))).id, 'powell');
});

test('the first add checks the selected warehouse even before the cart has an ID', async () => {
  const check = fixture(undefined);
  const stale = { message: 'activeCartChanged', code: 'STALE_WAREHOUSE' };

  await assert.rejects(check(policy.warehouseCartKey(null, 'forney')), stale);
  await assert.rejects(check(policy.warehouseCartKey('cart-b', 'powell')), stale);
  assert.equal((await check(policy.warehouseCartKey(null, 'powell'))).id, 'powell');
});

test('single-location mode permits an add form without warehouse fields', async () => {
  assert.equal(await fixture('cart-b', false)(null), undefined);
});

test('only a definite create rejection releases the first-add reservation', async () => {
  const clientErrors = require('@bigcommerce/catalyst-client');
  const noStock = new clientErrors.BigCommerceGQLError([
    { message: 'Not enough stock: Test item' },
  ]);
  const lostResponse = new Error('Connection closed');
  let nextError = noStock;
  const calls = [];
  const { createCart } = loadTestModule('../cart/create-cart.ts', {
    '@bigcommerce/catalyst-client': clientErrors,
    '~/auth': { getSessionCustomerAccessToken: async () => 'synthetic' },
    '~/client': {
      client: {
        fetch: async () => {
          calls.push('create');
          throw nextError;
        },
      },
    },
    '~/client/graphql': { graphql: (query) => query },
    '~/lib/currency': { getPreferredCurrencyCode: async () => 'USD' },
    '~/lib/pro-use/server': { assertProUseLineItems: async () => {} },
    '~/lib/wholesale-pricing': { assertPricingAccess: async () => {} },
    '~/lib/warehouse/server': {
      assertWarehouseItems: async () => ({ id: 'powell' }),
      reserveNewCartWarehouse: async () => {
        calls.push('reserve');

        return { release: async () => calls.push('release') };
      },
    },
  });

  await assert.rejects(createCart({}, null), noStock);
  assert.deepEqual(calls, ['reserve', 'create', 'release']);
  nextError = lostResponse;
  calls.length = 0;
  await assert.rejects(createCart({}, null), lostResponse);
  assert.deepEqual(calls, ['reserve', 'create']);
});
