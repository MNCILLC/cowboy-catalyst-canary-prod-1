const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, dependencies) {
  const loaded = new Module(file, module);

  loaded.require = (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error('Unexpected dependency');
  };

  // eslint-disable-next-line no-underscore-dangle -- Compile only the isolated module with explicit dependencies.
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

  return loaded.exports;
}

const bridge = compile(path.join(__dirname, 'initialization.ts'), {
  zod: require('zod'),
  'node:crypto': require('node:crypto'),
});
const cartId = '11111111-1111-4111-8111-111111111111';
const request = { cartId, requestId: 'a'.repeat(64), checkoutOrigin: 'https://checkout.example' };
const url = (overrides = {}) =>
  new URL(
    `https://store.example/warehouse-initialize/?${new URLSearchParams({ ...request, ...overrides })}`,
  );

test('accepts only exact allowed HTTPS origins, UUID carts and correlation nonces', () => {
  assert.deepEqual(bridge.parseInitializationRequest(url(), [request.checkoutOrigin]), request);
  [
    { checkoutOrigin: 'https://evil.example' },
    { checkoutOrigin: 'https://checkout.example/' },
    { checkoutOrigin: 'http://checkout.example' },
    { requestId: 'bad' },
    { cartId: 'bad' },
    { extra: 'field' },
  ].forEach((override) => {
    assert.throws(() => bridge.parseInitializationRequest(url(override), [request.checkoutOrigin]));
  });

  const duplicate = url();

  duplicate.searchParams.append('cartId', cartId);
  assert.throws(() => bridge.parseInitializationRequest(duplicate, [request.checkoutOrigin]));
});
test('bridge sends only to its exact opener target and safely serializes script markup', async () => {
  const payload = { label: '</script><script>evil()</script>', token: 'synthetic-only' };
  const response = bridge.initializationResponse(request, { warehouseCheckout: payload });
  const html = await response.text();

  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(html.includes(payload.label), false);

  let received;
  let closed = false;

  vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1], {
    window: {
      opener: {
        postMessage: (...args) => {
          received = args;
        },
      },
      close: () => {
        closed = true;
      },
    },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(received)),
    [
      {
        protocol: 'warehouse-initialization-v1',
        ...request,
        checkoutOrigin: undefined,
        warehouseCheckout: payload,
      },
      request.checkoutOrigin,
    ].map((value) => (typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value)),
  );
  assert.equal(closed, true);
});
test('route only discloses stock shortages after authentication and never signs a failed check', async () => {
  const policy = compile(path.join(__dirname, 'policy.ts'), {});
  let signed = 0;
  let prepared = 0;
  let authenticated = true;
  let failure;
  const route = compile(
    path.resolve(__dirname, '../../app/[locale]/(default)/warehouse-initialize/route.ts'),
    {
      '~/auth': {
        getSessionCustomerAccessToken: async () =>
          authenticated ? 'synthetic-session' : undefined,
      },
      '~/lib/checkout-authentication': { isCheckoutAuthenticationRequired: true },
      '~/lib/warehouse/config': {
        getWarehouseConfiguration: () => ({
          mode: 'staging',
          checkoutOrigins: [request.checkoutOrigin],
        }),
      },
      '~/lib/warehouse/initialization': bridge,
      '~/lib/warehouse/policy': policy,
      '~/lib/warehouse/server': {
        authorizeWarehouseInitialization: async (id) => {
          prepared += 1;
          assert.equal(id, cartId);
          if (failure) throw failure;

          return { record: {}, warehouse: { id: 'powell' } };
        },
      },
      '~/lib/warehouse/validation': {
        createValidationAccess: () => {
          signed += 1;

          return { token: 'synthetic-only' };
        },
      },
    },
  );
  let response = await route.GET({ nextUrl: url() });

  assert.equal(response.status, 200);
  assert.equal(signed, 1);
  authenticated = false;
  response = await route.GET({ nextUrl: url() });
  assert.equal(response.status, 403);
  assert.equal(prepared, 1);
  assert.equal(signed, 1);
  authenticated = true;
  failure = new Error('private upstream detail');
  response = await route.GET({ nextUrl: url() });
  assert.equal(response.status, 403);
  assert.equal(signed, 1);
  assert.equal((await response.text()).includes('private upstream detail'), false);

  try {
    policy.assertStock([{ key: 'p:1', name: 'Item', quantity: 1 }], new Map([['p:1', 0]]), 'North');
  } catch (error) {
    failure = error;
  }

  response = await route.GET({ nextUrl: url() });
  assert.equal(response.status, 409);

  const html = await response.text();

  assert.match(html, /INVENTORY_CONFLICT/);
  assert.match(html, /Item: 0 available at North; 1 requested. Return to your cart/);
  assert.doesNotMatch(html, /warehouseCheckout|synthetic-only/);
  assert.equal(signed, 1);
  response = await route.GET({ nextUrl: url({ checkoutOrigin: 'https://evil.example' }) });
  assert.equal(response.status, 400);
  assert.equal(prepared, 3);
});
