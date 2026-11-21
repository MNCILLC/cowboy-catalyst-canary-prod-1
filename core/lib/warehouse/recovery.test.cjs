/* eslint-disable no-underscore-dangle -- Isolated source loader; all external dependencies forbidden. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test, beforeEach, after } = require('node:test');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const { z } = require('zod');
const original = { ...process.env };
let value, reads, broken, mode, apiCalls, grants;
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(__dirname, name + '.ts');
  const mod = new Module(file, module);
  cache.set(name, mod);
  mod.require = (id) => {
    if (id === 'server-only') return {};
    if (id === 'node:crypto') return require('node:crypto');
    if (id === 'zod') return { z };
    if (id === '@upstash/redis')
      return {
        Redis: class {
          async get(key) {
            reads.push(key);
            if (broken) throw Error('lost');
            return value;
          }
        },
      };
    if (id === './config')
      return {
        getWarehouseConfiguration: () => ({ mode, channelId: 37 }),
        warehouseCheckoutOriginAllowed: (origin) => origin === 'https://checkout.example',
        getWarehouses: () => [],
      };
    if (id === './locations') return { getEnabledWarehouses: async () => [] };
    if (id === './api')
      return {
        warehouseApi: () => {
          apiCalls++;
          throw Error('No live cart/API allowed');
        },
      };
    if (id === './server')
      return {
        checkWarehouseStock: () => {
          throw Error('No stock mutation');
        },
      };
    if (id === './persistence')
      return {
        readWarehouseRecord: () => {
          throw Error('Converted cart record unavailable');
        },
      };
    if (
      ['./authorization', './policy', './check-test', './validation', './submission'].includes(id)
    )
      return load(id.slice(2));
    throw Error('Forbidden dependency: ' + id);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  return mod.exports;
}
const { signValidationClaims } = load('authorization');
const { testPaymentAttemptKey } = load('check-test');
const { readSubmissionRecovery } = load('recovery');
const scope = {
  version: 1,
  storeHash: 'synthetic-store',
  channelId: 37,
  cartId: '11111111-1111-4111-8111-111111111111',
  warehouseId: 'west',
  revision: '22222222-2222-4222-8222-222222222222',
};
const secret = 'synthetic-recovery-secret-at-least-32-characters';
const token = (patch = {}) =>
  signValidationClaims(
    {
      ...scope,
      purpose: 'warehouse-validation',
      origin: 'https://checkout.example',
      exp: Math.floor(Date.now() / 1000) + 300,
      ...patch,
    },
    'warehouse-validation-v1:' + secret,
  );
const read = (
  t = token(),
  origin = 'https://checkout.example',
  cart = scope.cartId,
  revision = scope.revision,
) => readSubmissionRecovery(t, origin, cart, revision);
beforeEach(() => {
  value = null;
  reads = [];
  broken = false;
  mode = 'staging';
  apiCalls = 0;
  grants = 0;
  Object.assign(process.env, {
    WAREHOUSE_VALIDATION_SECRET: secret,
    BIGCOMMERCE_STORE_HASH: scope.storeHash,
    WAREHOUSE_REDIS_URL: 'https://synthetic.invalid',
    WAREHOUSE_REDIS_TOKEN: 'synthetic',
    WAREHOUSE_REDIS_NAMESPACE: 'synthetic-recovery',
  });
  delete process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION;
  delete process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION;
});
after(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
test('reads the exact permanent claim key; no grant, API, record, write or TTL access', async () => {
  assert.equal(await read(), false);
  value = 'claimed';
  assert.equal(await read(), true);
  assert.deepEqual(reads, [
    testPaymentAttemptKey('synthetic-recovery', scope),
    testPaymentAttemptKey('synthetic-recovery', scope),
  ]);
  assert.equal(apiCalls, 0);
});
test('any existing tombstone remains blocked even after policy removal or malformed contents', async () => {
  for (const stored of ['malformed', '', 0, {}]) {
    value = stored;
    assert.equal(await read(), true);
  }
  assert.equal(apiCalls, 0);
});
test('wrong signature, origin, store, channel, cart, expiry and revision are denied before Redis', async () => {
  for (const args of [
    [token() + 'x'],
    [token(), 'https://evil.example'],
    [token({ storeHash: 'other' })],
    [token({ channelId: 38 })],
    [token({ exp: 1 })],
    [token(), undefined, '33333333-3333-4333-8333-333333333333'],
    [token(), undefined, undefined, 'old'],
  ])
    await assert.rejects(read(...args));
  assert.equal(reads.length, 0);
});
test('Redis failure or missing configuration fails closed; development does not issue test claims', async () => {
  broken = true;
  await assert.rejects(read(), (error) => error.code === 'RECOVERY_UNAVAILABLE');
  broken = false;
  delete process.env.WAREHOUSE_REDIS_TOKEN;
  await assert.rejects(read(), (error) => error.status === 503);
  mode = 'development';
  assert.equal(await read(), false);
});
test('route returns bounded recovery before converted-cart lookup and before grants for ordinary and claim requests', async () => {
  value = 'claimed';
  const file = path.resolve(__dirname, '../../app/api/warehouse/validate/route.ts');
  const mod = new Module(file, module);
  const deps = {
    'next/server': { NextRequest, NextResponse },
    zod: { z },
    '~/lib/warehouse/authorization': load('authorization'),
    '~/lib/warehouse/policy': load('policy'),
    '~/lib/warehouse/config': {
      warehousePreviewEnabled: () => true,
      warehouseCheckoutOriginAllowed: (o) => o === 'https://checkout.example',
    },
    '~/lib/warehouse/recovery': { readSubmissionRecovery },
    '~/lib/warehouse/validation': {
      validateWarehouseCheckout: () => {
        apiCalls++;
        throw Error('converted cart');
      },
    },
    '~/lib/warehouse/check-test-server': {
      authorizeCheckTest: () => {
        grants++;
      },
    },
    '~/lib/warehouse/test-provider-server': {
      authorizeTestProvider: () => {
        grants++;
      },
    },
  };
  mod.require = (id) => {
    assert.ok(id in deps);
    return deps[id];
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    file,
  );
  for (const claim of [
    {},
    {
      testProvider: {
        token: 'synthetic',
        methodId: 'bigpaypay',
        gatewayId: null,
        usesStoredInstrument: false,
        shouldSaveInstrument: false,
      },
    },
  ]) {
    const response = await mod.exports.POST(
      new NextRequest('https://backend.example/api/warehouse/validate', {
        method: 'POST',
        headers: { origin: 'https://checkout.example', authorization: 'Bearer ' + token() },
        body: JSON.stringify({ cartId: scope.cartId, revision: scope.revision, ...claim }),
      }),
    );
    assert.equal(response.status, 409);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data.recovery, { status: 'review_required' });
    assert.equal(data.cartId, scope.cartId);
    assert.equal(data.checkTestAuthorization, undefined);
    assert.equal(data.testProviderAuthorization, undefined);
  }
  assert.equal(grants, 0);
  assert.equal(apiCalls, 0);
});
