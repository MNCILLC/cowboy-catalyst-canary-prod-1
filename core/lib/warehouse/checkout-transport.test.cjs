const { NextRequest, NextResponse } = require('next/server');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const file = path.resolve(__dirname, '../../app/[locale]/(default)/checkout/route.ts');
const compiled = new Module(file, module);
let mode = 'staging';
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
  '~/lib/warehouse/config': {
    warehousePreviewEnabled: () => mode !== 'off',
    warehouseCheckoutOriginAllowed: (origin) => origin === 'https://checkout.invalid',
  },
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

compiled.require = (id) => {
  if (id in dependencies) return dependencies[id];
  throw new Error(`Unexpected dependency ${id}`);
};

// eslint-disable-next-line no-underscore-dangle -- Compile the actual route against explicit isolated adapters.
compiled._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  file,
);

const run = (search = '') =>
  compiled.exports.GET(new NextRequest(`https://store.invalid/checkout/${search}`), {
    params: Promise.resolve({ locale: 'en' }),
  });

test('ordinary warehouse navigation redirects to the exact validated checkout URL', async () => {
  mode = 'staging';

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

['staging', 'preview', 'development'].forEach((warehouseMode) => {
  test(`explicit ${warehouseMode} rehearsals retain the protected v2 JSON handoff`, async () => {
    mode = warehouseMode;

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

test('warehouse off keeps the standard checkout path even with a rehearsal request', async () => {
  mode = 'off';

  const before = prepared;

  assert.equal((await run('?handoff=json')).status, 302);
  assert.equal(prepared, before);
});

['', '?handoff=json'].forEach((search) => {
  test(`warehouse and origin failures block ${search || 'ordinary navigation'}`, async () => {
    mode = 'staging';

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
