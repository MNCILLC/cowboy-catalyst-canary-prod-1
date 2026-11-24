/* eslint-disable max-classes-per-file -- Distinct synthetic error types match production classification. */
const { NextRequest, NextResponse } = require('next/server');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { z } = require('zod');

class AuthorizationError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

['validate', 'freight'].forEach((name) => {
  test(`${name}: route retains origin, authorization and disabled-mode checks`, async () => {
    let enabled = true;
    let authenticatedCalls = 0;
    const rejectCredential = async () => {
      authenticatedCalls += 1;
      throw new AuthorizationError('Invalid signed credential.', 401, 'UNAUTHORIZED');
    };
    const dependencies = {
      'next/server': { NextRequest, NextResponse },
      zod: { z },
      '~/lib/warehouse/recovery': { readSubmissionRecovery: async () => false },
      '~/lib/warehouse/config': {
        warehousePreviewEnabled: () => enabled,
        warehouseCheckoutOriginAllowed: (origin) => origin === 'https://checkout.example',
      },
      '~/lib/warehouse/authorization': { WarehouseValidationError: AuthorizationError },
      '~/lib/warehouse/policy': { WarehouseError: class extends Error {} },
      '~/lib/warehouse/test-provider-server': { authorizeTestProvider: async () => ({}) },
      '~/lib/warehouse/check-test-server': { authorizeCheckTest: async () => ({}) },
      '~/lib/warehouse/validation': { validateWarehouseCheckout: rejectCredential },
      '~/lib/warehouse/freight': { warehouseFreight: rejectCredential },
      '~/lib/freight-cart/policy': { shippingSelectionSchema: z.object({}) },
      '~/lib/freight-cart/transport': { FreightPreferenceConflict: Error },
    };
    const file = path.resolve(__dirname, `../../app/api/warehouse/${name}/route.ts`);
    const loaded = new Module(file, module);

    loaded.require = (id) => {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);

      return dependencies[id];
    };

    // eslint-disable-next-line no-underscore-dangle -- Load only the route with isolated dependencies.
    loaded._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      file,
    );

    const route = loaded.exports;
    const request = (method, origin, token) =>
      new NextRequest(`https://store.example/api/warehouse/${name}`, {
        method,
        headers: {
          origin: origin ?? 'https://checkout.example',
          'content-type': 'application/json',
          ...(token ? { authorization: token } : {}),
        },
        ...(method === 'POST'
          ? {
              body: JSON.stringify({
                cartId: '11111111-1111-4111-8111-111111111111',
                revision: '22222222-2222-4222-8222-222222222222',
              }),
            }
          : {}),
      });
    const preflight = route.OPTIONS(request('OPTIONS'));

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://checkout.example');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    assert.equal(authenticatedCalls, 0);
    await Promise.all(
      ['', 'https://evil.example'].map(async (origin) => {
        assert.equal(route.OPTIONS(request('OPTIONS', origin)).status, 403);
        assert.equal((await route.POST(request('POST', origin))).status, 403);
      }),
    );

    const missing = await route.POST(request('POST'));

    assert.equal(missing.status, 401);
    assert.equal(missing.headers.get('access-control-allow-origin'), 'https://checkout.example');
    assert.equal(authenticatedCalls, 0);
    assert.equal((await route.POST(request('POST', undefined, 'Bearer invalid'))).status, 401);
    assert.equal(authenticatedCalls, 1);
    enabled = false;
    assert.equal(route.OPTIONS(request('OPTIONS')).status, 404);
    assert.equal((await route.POST(request('POST'))).status, 404);
  });
});

test('validate: provider claims retain strict transport and cannot mix with Check', async (t) => {
  let calls = 0;
  let received;
  const result = { version: 1, warehouse: { id: 'west' } };
  const dependencies = {
    'next/server': { NextRequest, NextResponse },
    zod: { z },
    '~/lib/warehouse/recovery': { readSubmissionRecovery: async () => false },
    '~/lib/warehouse/config': {
      warehousePreviewEnabled: () => true,
      warehouseCheckoutOriginAllowed: () => true,
    },
    '~/lib/warehouse/authorization': { WarehouseValidationError: AuthorizationError },
    '~/lib/warehouse/policy': { WarehouseError: class extends Error {} },
    '~/lib/warehouse/check-test-server': { authorizeCheckTest: async () => ({}) },
    '~/lib/warehouse/test-provider-server': {
      authorizeTestProvider: async (input) => {
        received = input;

        return input.checkClaim ? { checkTestClaimed: true } : { testProviderClaimed: true };
      },
    },
    '~/lib/warehouse/validation': {
      validateWarehouseCheckout: async () => {
        calls += 1;

        return result;
      },
    },
  };
  const file = path.resolve(__dirname, '../../app/api/warehouse/validate/route.ts');
  const loaded = new Module(file, module);

  loaded.require = (id) => {
    assert.ok(id in dependencies);

    return dependencies[id];
  };

  // eslint-disable-next-line no-underscore-dangle -- Load the route against isolated dependencies only.
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    file,
  );

  const claim = {
    token: 'synthetic',
    methodId: 'bigpaypay',
    gatewayId: null,
    usesStoredInstrument: false,
    shouldSaveInstrument: false,
  };
  const body = {
    cartId: '11111111-1111-4111-8111-111111111111',
    revision: '22222222-2222-4222-8222-222222222222',
    testProvider: claim,
  };
  const invoke = (value) =>
    loaded.exports.POST(
      new NextRequest('https://backend.example/api/warehouse/validate', {
        method: 'POST',
        headers: { origin: 'https://checkout.example', authorization: 'Bearer synthetic' },
        body: JSON.stringify(value),
      }),
    );

  const invalid = [
    { ...body, checkTest: { token: 'synthetic', methodId: 'cheque', gatewayId: null } },
    { ...body, testProvider: { ...claim, methodId: 'stripe' } },
    { ...body, testProvider: { ...claim, gatewayId: 'other' } },
    { ...body, testProvider: { ...claim, usesStoredInstrument: true } },
    { ...body, testProvider: { ...claim, shouldSaveInstrument: true } },
    { ...body, testProvider: { ...claim, ccNumber: 'synthetic-not-card-data' } },
    { ...body, testProvider: { ...claim, token: '' } },
  ];

  await Promise.all(invalid.map(async (value) => assert.equal((await invoke(value)).status, 400)));
  assert.equal(calls, 0);

  const response = await invoke(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(received.claim, claim);
  assert.equal(received.warehouseId, 'west');
  assert.equal((await response.json()).testProviderClaimed, true);

  const prior = process.env.WAREHOUSE_TEST_PROVIDER_POLICY;

  t.after(() => {
    if (prior === undefined) delete process.env.WAREHOUSE_TEST_PROVIDER_POLICY;
    else process.env.WAREHOUSE_TEST_PROVIDER_POLICY = prior;
  });
  process.env.WAREHOUSE_TEST_PROVIDER_POLICY = JSON.stringify({ allowLocalCheck: true });

  const check = { token: 'synthetic-check', methodId: 'cheque', gatewayId: null };
  const local = await invoke({ cartId: body.cartId, revision: body.revision, checkTest: check });

  assert.equal(local.status, 200);
  assert.deepEqual(received.checkClaim, check);
  assert.equal(received.claim, undefined);
  assert.equal((await local.json()).checkTestClaimed, true);
});
