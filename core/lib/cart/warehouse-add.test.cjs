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
        fetch: async ({ variables }) => {
          assert.equal(variables.createCartInput.externalSource, 'reservation-id');
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

        return {
          source: 'reservation-id',
          release: async () => calls.push('release'),
          markUncertain: async () => calls.push('uncertain'),
        };
      },
    },
  });

  await assert.rejects(createCart({}, null), noStock);
  assert.deepEqual(calls, ['reserve', 'create', 'release']);
  nextError = lostResponse;
  calls.length = 0;
  await assert.rejects(createCart({}, null), { cause: lostResponse });
  assert.deepEqual(calls, ['reserve', 'create', 'uncertain']);
});

test('a persistent cart is a recovery candidate only for the same shopper and first-add source', async () => {
  let token = 'synthetic-token';
  const data = {
    customer: { entityId: 17 },
    site: { cart: { entityId: 'candidate', externalSource: 'first-add' } },
  };
  const { findFirstAddCart } = loadTestModule('../../client/queries/get-customer.ts', {
    '~/auth': { getSessionCustomerAccessToken: async () => token },
    '~/client/graphql': { graphql: (query) => query },
    '~/client': {
      client: {
        fetch: async (request) => {
          assert.equal(request.customerAccessToken, 'synthetic-token');
          assert.equal(request.fetchOptions.cache, 'no-store');

          return { data };
        },
      },
    },
  });

  assert.equal(await findFirstAddCart(17, 'first-add'), 'candidate');
  assert.equal(await findFirstAddCart(18, 'first-add'), null);
  assert.equal(await findFirstAddCart(17, 'previous-add'), null);
  token = null;
  assert.equal(await findFirstAddCart(17, 'first-add'), null);
  token = 'synthetic-token';
  data.site.cart = null;
  assert.equal(await findFirstAddCart(17, 'first-add'), null);
});

test('the recovery sign-in form omits any active cart from login and opens the cart page', async () => {
  const authDir = '../../app/[locale]/(default)/';
  const translations = { getTranslations: async () => (key) => key, getLocale: async () => 'en' };
  const logins = [];
  const { login } = loadTestModule(`${authDir}(auth)/login/_actions/login.ts`, {
    '@bigcommerce/catalyst-client': require('@bigcommerce/catalyst-client'),
    '@conform-to/zod': require('@conform-to/zod'),
    'next-auth': {},
    'next-intl/server': translations,
    '@/vibes/soul/sections/sign-in-section/schema': {
      schema: zod.z.object({ email: zod.z.string().email(), password: zod.z.string() }),
    },
    '~/auth': { signIn: async (_provider, options) => logins.push(options.cartId) },
    '~/lib/cart': { getCartId: async () => 'existing-forney-id' },
    '~/i18n/routing': { redirect: ({ href }) => href },
  });
  const page = loadTestModule(`${authDir}cart/recover/page.tsx`, {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': {},
    'next-intl/server': translations,
    '@/vibes/soul/sections/sign-in-section': { SignInSection: () => null },
    '~/lib/warehouse/config': { warehousePreviewEnabled: () => true },
    '../../(auth)/login/_actions/login': { login },
  });
  const form = new FormData();

  form.set('email', 'shopper@example.invalid');
  form.set('password', 'fixture');

  const { props } = await page.default();

  assert.equal(await props.action(null, form), '/cart');
  assert.equal(await login({ redirectTo: '/account' }, null, form), '/account');
  assert.deepEqual(logins, [undefined, 'existing-forney-id']);
});
