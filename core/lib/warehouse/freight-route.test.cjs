/* eslint-disable max-classes-per-file, no-console -- Isolated dependency types and captured diagnostics. */
const { NextRequest, NextResponse } = require('next/server');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { z } = require('zod');

function compile(file, dependencies) {
  const loaded = new Module(file, module);

  loaded.require = (id) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);

    return dependencies[id];
  };

  // eslint-disable-next-line no-underscore-dangle -- Isolated production module loader.
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

  return loaded.exports;
}

const transport = compile(path.resolve(__dirname, '../freight-cart/transport.ts'), {
  zod: { z },
  './policy': { shippingPreferencesSchema: z.object({}) },
});
let failure;
const route = compile(path.resolve(__dirname, '../../app/api/warehouse/freight/route.ts'), {
  'next/server': { NextRequest, NextResponse },
  zod: { z },
  '~/lib/freight-cart/policy': { shippingSelectionSchema: z.object({}) },
  '~/lib/freight-cart/transport': transport,
  '~/lib/warehouse/authorization': { WarehouseValidationError: class extends Error {} },
  '~/lib/warehouse/policy': { WarehouseError: class extends Error {} },
  '~/lib/warehouse/config': {
    warehousePreviewEnabled: () => true,
    warehouseCheckoutOriginAllowed: () => true,
  },
  '~/lib/warehouse/freight': {
    warehouseFreight: async () => {
      throw failure;
    },
  },
});

async function invoke(error) {
  failure = error;

  const logs = [];
  const original = console.error;

  console.error = (...args) => logs.push(args);

  try {
    const response = await route.POST(
      new NextRequest('https://store.invalid/api/warehouse/freight', {
        method: 'POST',
        headers: { origin: 'https://checkout.invalid', authorization: 'Bearer private-capability' },
        body: JSON.stringify({
          cartId: '11111111-1111-4111-8111-111111111111',
          revision: '22222222-2222-4222-8222-222222222222',
        }),
      }),
    );

    return { status: response.status, body: await response.json(), logs };
  } finally {
    console.error = original;
  }
}

test('Freight upstream failures retain safe status diagnostics and a generic shopper message', async () => {
  const result = await invoke(new transport.FreightPreferenceUnavailable('http', 503));

  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'UNAVAILABLE');
  assert.deepEqual(result.logs, [
    [
      'Warehouse Freight validation unavailable',
      { dependency: 'freight', reason: 'http', upstreamStatus: 503 },
    ],
  ]);
  assert.ok(!JSON.stringify(result).includes('private-capability'));
});
test('malformed upstream responses are service outages rather than shopper input errors', async () => {
  const result = await invoke(new transport.FreightPreferenceUnavailable('invalid-response', 200));

  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'UNAVAILABLE');
  assert.equal(result.logs[0][1].reason, 'invalid-response');
});
test('unknown errors never log raw messages, URLs or tokens', async () => {
  const result = await invoke(new Error('https://private.invalid/?token=secret-shopper-data'));

  assert.equal(result.status, 503);
  assert.equal(result.logs[0][1].dependency, 'unknown');
  assert.ok(!JSON.stringify(result).includes('secret-shopper-data'));
});
test('stale preferences remain a non-retryable conflict', async () => {
  const result = await invoke(new transport.FreightPreferenceConflict('Reload preferences.'));

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'STALE_FREIGHT');
  assert.deepEqual(result.logs, []);
});
