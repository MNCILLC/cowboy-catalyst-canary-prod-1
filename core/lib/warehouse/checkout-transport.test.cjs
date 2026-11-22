const { NextRequest, NextResponse } = require('next/server');
const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const { renderToStaticMarkup } = require('react-dom/server');

const { hostedEnv, loadTestModule, warehouse } = require('./mode-test-support.cjs');

const originalEnv = process.env;
let locations;
let locationReads;
let pickerContext;

beforeEach((t) => {
  process.env = { ...hostedEnv, BIGCOMMERCE_ACCESS_TOKEN: 'synthetic-token' };
  locations = [{ id: warehouse.locationId, enabled: true }];
  locationReads = 0;
  pickerContext = { cartId: null, revision: null };
  t.mock.method(global, 'fetch', (url, options) => {
    const endpoint = new URL(url);

    assert.equal(endpoint.origin, 'https://api.bigcommerce.com');
    assert.equal(endpoint.pathname, '/stores/synthetic-a/v3/inventory/locations');
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    locationReads += 1;
    if (locations === null) return Response.json({}, { status: 503 });

    return Response.json({ data: locations });
  });
});
afterEach(() => {
  process.env = originalEnv;
});

const config = loadTestModule('config.ts', {
  'server-only': {},
  './configuration': loadTestModule('configuration.ts', { zod: require('zod') }),
});
const react = { react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime') };
const policy = loadTestModule('policy.ts', {});
const authorization = loadTestModule('authorization.ts', {
  'node:crypto': require('node:crypto'),
  zod: require('zod'),
  './policy': policy,
});
const locationLookup = loadTestModule('locations.ts', {
  'server-only': {},
  'next/navigation': { unstable_rethrow() {} },
  react: react.react,
  zod: require('zod'),
  './api': loadTestModule('api.ts', { 'server-only': {}, './authorization': authorization }),
  './authorization': authorization,
  './config': config,
});
const pickerPath = '../../components/warehouse-picker/';
const { WarehousePicker } = loadTestModule(`${pickerPath}index.tsx`, {
  ...react,
  '~/lib/warehouse/config': config,
  '~/lib/warehouse/authorization': authorization,
  '~/lib/warehouse/locations': locationLookup,
  '~/lib/warehouse/server': {
    getWarehouseContext: async () => pickerContext,
  },
  './actions': {},
  './availability-scope': loadTestModule(`${pickerPath}availability-scope.tsx`, react),
  './picker': loadTestModule(`${pickerPath}picker.tsx`, {
    ...react,
    '~/lib/warehouse/policy': policy,
    './actions': {},
    './selection-attempt': {},
  }),
});

let prepared = 0;
let signed = 0;
let failStock = false;
let destination = 'https://checkout.invalid/session-sync?jwt=synthetic';

class PolicyError extends Error {}

const dependencies = {
  '~/lib/warehouse/local-checkout': { assertWarehouseCheckoutReady: async () => {} },
  '@bigcommerce/catalyst-client': { BigCommerceAuthError: TypeError },
  'next/navigation': { unstable_rethrow() {} },
  'next/server': { NextResponse },
  'next-intl/server': { getTranslations: async () => () => 'Synthetic message' },
  '~/auth': { getSessionCustomerAccessToken: async () => 'synthetic-session' },
  '~/channels.config': { getChannelIdFromLocale: () => 37 },
  '~/client': {
    client: {
      fetch: async ({ document }) =>
        document.includes('CheckoutEligibilityQuery')
          ? { data: { site: { checkout: { subtotal: { value: 100, currencyCode: 'USD' } } } } }
          : {
              data: {
                cart: {
                  createCartRedirectUrls: {
                    errors: [],
                    redirectUrls: {
                      redirectedCheckoutUrl: destination,
                    },
                  },
                },
              },
            },
    },
  },
  '~/client/graphql': { graphql: (value) => value },
  '~/i18n/routing': {
    redirect: ({ href }) => new Response(null, { status: 302, headers: { location: href } }),
  },
  '~/lib/analytics/bigcommerce': {
    getVisitIdCookie: async () => '',
    getVisitorIdCookie: async () => '',
  },
  '~/lib/cart': { getCartId: async () => '11111111-1111-4111-8111-111111111111' },
  '~/lib/cart/minimum-order': { getMinimumOrderSubtotal: () => 0 },
  '~/lib/checkout-authentication': { isCheckoutAuthenticationRequired: true },
  '~/lib/consent-manager/cookies/server': { getConsentCookie: async () => ({}) },
  '~/lib/freight-cart/server': {
    assertCartShipping: async () => undefined,
    CartShippingError: PolicyError,
  },
  '~/lib/loyalty/server': {
    assertLoyaltyCheckout: async () => {},
    LoyaltyCheckoutError: PolicyError,
  },
  '~/lib/pickup-checkout/policy': { PickupCheckoutError: PolicyError },
  '~/lib/pickup-checkout/server': { preparePickupCheckout: async () => {} },
  '~/lib/pro-use/policy': { ProUseRequiredError: PolicyError },
  '~/lib/pro-use/server': { assertProUseCart: async () => {} },
  '~/lib/server-toast': { serverToast: { error: async () => {} } },
  '~/lib/warehouse/config': config,
  '~/lib/warehouse/policy': { WarehouseError: PolicyError },
  '~/lib/warehouse/server': {
    prepareWarehousePreview: async () => {
      prepared += 1;
      if (failStock) throw new PolicyError('Stock failure');

      return { record: { cartId: '11111111-1111-4111-8111-111111111111' }, warehouse: {} };
    },
  },
  '~/lib/warehouse/validation': {
    createValidationAccess: () => {
      signed += 1;

      return { token: 'synthetic' };
    },
  },
};

const { GET } = loadTestModule('../../app/[locale]/(default)/checkout/route.ts', dependencies);

const run = (search = '') =>
  GET(new NextRequest(`https://store.invalid/checkout/${search}`), {
    params: Promise.resolve({ locale: 'en' }),
  });

test('a recovered cart offers the enabled shipping origin for confirmation', async () => {
  const origin = { ...warehouse, id: 'south', label: 'South', locationId: 1, pickupMethodId: 12 };
  const render = async () =>
    renderToStaticMarkup(await WarehousePicker({ children: 'Storefront' }));

  process.env.WAREHOUSE_CONFIG = JSON.stringify([warehouse, origin]);
  pickerContext = { cartId: 'cart', revision: null };
  locations.push({ id: origin.locationId, enabled: true });

  const recovery = await render();

  assert.match(recovery, /<option value="south" selected="">South/);
  assert.match(recovery, /Confirm warehouse/);
  locations[1].enabled = false;

  const disabled = await render();

  assert.doesNotMatch(disabled, /value="south"|Confirm warehouse/);
  locations[1].enabled = true;
  pickerContext = { ...pickerContext, warehouse, revision: 'saved' };

  const saved = await render();

  assert.match(saved, /<option value="north" selected="">North/);
  assert.doesNotMatch(saved, /Confirm warehouse/);
});

test('one running storefront reflects Powell being disabled and re-enabled on the next render', async () => {
  process.env.WAREHOUSE_CONFIG = JSON.stringify([
    {
      ...warehouse,
      id: 'forney',
      locationId: 1,
      pickupMethodId: 1,
      label: 'Ship/Pickup in Forney, TX',
    },
    { ...warehouse, id: 'powell', locationId: 2, pickupMethodId: 2, label: 'Pickup in Powell, WY' },
  ]);

  const powell = { id: 2, enabled: true };

  // An enabled but unconfigured location may never add an option or change the configured order.
  locations = [{ id: 3, enabled: true }, powell, { id: 1, enabled: true }];

  const options = async () => {
    const html = renderToStaticMarkup(await WarehousePicker({ children: 'Storefront' }));

    return Array.from(html.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g), (match) => [
      match[1],
      match[2],
    ]);
  };
  const forneyOption = ['forney', 'Ship/Pickup in Forney, TX'];
  const powellOption = ['powell', 'Pickup in Powell, WY'];

  assert.deepEqual(await options(), [forneyOption, powellOption]);
  powell.enabled = false;
  assert.deepEqual(await options(), [forneyOption]);
  powell.enabled = true;
  assert.deepEqual(await options(), [forneyOption, powellOption]);
  locations = [{ id: 1, enabled: true }];
  assert.deepEqual(await options(), [forneyOption]);
  assert.equal(locationReads, 4);
});

[[], [{ id: warehouse.locationId, enabled: false }], null].forEach((response) => {
  test(`unavailable locations (${JSON.stringify(response)}) show a message while the storefront still renders`, async () => {
    locations = response;

    const html = renderToStaticMarkup(await WarehousePicker({ children: 'Storefront' }));

    assert.doesNotMatch(html, /warehouse-choice/);
    assert.match(html, /No shopping warehouses are available/);
    assert.match(html, /Storefront/);
  });
});

['multi-location', 'staging'].forEach((mode) => {
  test(`${mode} renders the picker and redirects to the validated checkout URL`, async () => {
    process.env.WAREHOUSE_MODE = mode;

    const html = renderToStaticMarkup(await WarehousePicker({ children: 'Storefront' }));

    assert.match(html, /<select[^>]+id="warehouse-choice"/);
    assert.match(html, /<option value="north">North<\/option>/);

    const before = prepared;
    const signatures = signed;
    const response = await run();

    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), destination);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '');
    assert.equal(prepared, before + 1);
    assert.equal(signed, signatures);
  });
});

['staging', 'preview', 'development'].forEach((warehouseMode) => {
  test(`explicit ${warehouseMode} rehearsals retain the protected v2 JSON handoff`, async () => {
    process.env.WAREHOUSE_MODE = warehouseMode;
    if (warehouseMode !== 'staging') process.env.NODE_ENV = 'development';
    if (warehouseMode === 'development')
      process.env.WAREHOUSE_VALIDATION_BASE_URL = 'http://localhost:3000';

    const before = prepared;
    const signatures = signed;
    const response = await run('?handoff=json');

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const handoff = await response.json();

    assert.equal(handoff.protocol, 'warehouse-preview-v2');
    assert.equal(handoff.warehouseCheckout.preview, true);
    assert.equal(handoff.warehouseCheckout.cartId, '11111111-1111-4111-8111-111111111111');
    assert.equal(handoff.warehouseCheckout.validation.token, 'synthetic');
    assert.equal(handoff.checkoutUrl, destination);
    assert.equal(prepared, before + 1);
    assert.equal(signed, signatures + 1);
  });
});

['off', undefined].forEach((mode) => {
  test(`${mode ?? 'unset'} omits the picker and uses the standard BigCommerce checkout handoff`, async () => {
    if (mode === undefined) delete process.env.WAREHOUSE_MODE;
    else process.env.WAREHOUSE_MODE = mode;
    process.env.NODE_ENV = 'development';
    process.env.WAREHOUSE_PREVIEW_ENABLED = 'true';
    assert.equal(
      renderToStaticMarkup(await WarehousePicker({ children: 'Storefront' })),
      'Storefront',
    );

    const before = prepared;
    const signatures = signed;
    const responses = await Promise.all([run(), run('?handoff=json')]);

    responses.forEach((response) => {
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), destination);
    });
    assert.equal(prepared, before);
    assert.equal(signed, signatures);
    assert.equal(locationReads, 0);
  });
});

['', '?handoff=json'].forEach((search) => {
  test(`warehouse and origin failures block ${search || 'ordinary navigation'}`, async () => {
    const expected = destination;

    try {
      failStock = true;
      assert.equal((await run(search)).headers.get('location'), '/cart');
      failStock = false;
      destination = 'https://unexpected.invalid/checkout';
      assert.equal((await run(search)).headers.get('location'), '/cart');
    } finally {
      failStock = false;
      destination = expected;
    }
  });
});
