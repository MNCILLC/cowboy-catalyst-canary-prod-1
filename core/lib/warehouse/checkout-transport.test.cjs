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

class PolicyError extends Error {}

const dependencies = {
  '~/lib/warehouse/local-checkout': { assertLocalCheckoutReady: async () => {} },
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
                      redirectedCheckoutUrl: 'https://checkout.invalid/session-sync?jwt=synthetic',
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
    getWarehouseConfiguration: () => ({ mode }),
  },
  '~/lib/warehouse/policy': { WarehouseError: PolicyError },
  '~/lib/warehouse/server': {
    prepareWarehousePreview: async () => {
      prepared += 1;
      if (failStock) throw new PolicyError('Stock failure');

      return { record: {}, warehouse: {} };
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

const run = () =>
  compiled.exports.GET(new NextRequest('https://store.invalid/checkout/'), {
    params: Promise.resolve({ locale: 'en' }),
  });

test('staging retains a protected handoff instead of redirecting into an unactivated hosted checkout', async () => {
  mode = 'staging';

  const response = await run();
  const handoff = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(handoff.protocol, 'warehouse-preview-v2');
  assert.equal(handoff.warehouseCheckout.preview, true);
  assert.equal(prepared, 1);
  assert.equal(signed, 1);
});
test('development preview retains the old runner contract', async () => {
  mode = 'preview';

  const response = await run();

  assert.equal(response.status, 200);
  assert.equal((await response.json()).protocol, 'warehouse-preview-v2');
  assert.equal(signed, 2);
});
test('off keeps ordinary redirect behavior, and staging stock failure cannot redirect to checkout', async () => {
  mode = 'off';

  const before = prepared;

  assert.equal((await run()).status, 302);
  assert.equal(prepared, before);
  mode = 'staging';
  failStock = true;
  assert.equal((await run()).headers.get('location'), '/cart');
});
