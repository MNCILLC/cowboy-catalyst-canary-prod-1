const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Actual authorization, policy, snapshot and validation code; ONLY in-memory dependencies.
// No credentials are loaded and the real Management API module is never imported.
const original = {
  hash: process.env.BIGCOMMERCE_STORE_HASH,
  secret: process.env.WAREHOUSE_VALIDATION_SECRET,
};
process.env.BIGCOMMERCE_STORE_HASH = 'test-store';
process.env.WAREHOUSE_VALIDATION_SECRET = 'offline-test-signing-secret-not-a-real-credential';
after(() => {
  for (const [key, value] of [
    ['BIGCOMMERCE_STORE_HASH', original.hash],
    ['WAREHOUSE_VALIDATION_SECRET', original.secret],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const origin = 'https://checkout.example';
const warehouse = {
  id: 'west',
  label: 'West',
  pickupLabel: 'West pickup',
  locationId: 72,
  pickupMethodId: 83,
  allowShipping: false,
};
const initialRecord = {
  version: 1,
  storeHash: 'test-store',
  channelId: 37,
  cartId: 'b941ba73-b094-4b9c-a288-6be664bc1aa8',
  warehouseId: 'west',
  revision: '144a95b8-3272-4b1c-8195-12f35e10524b',
};
let record, current, available, stockHook, apiHook, reads;
const cache = {};
function load(name) {
  if (cache[name]) return cache[name].exports;
  const filename = path.join(__dirname, name + '.ts');
  const compiled = new Module(filename, module);
  cache[name] = compiled;
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled.require = (id) => {
    if (id === 'server-only') return {};
    if (id === 'node:crypto' || id === 'zod') return require(id);
    if (id === './api')
      return {
        warehouseApi: async (endpoint, method) => {
          assert.equal(method, undefined, 'validator must only read');
          assert.equal(endpoint, 'checkouts/' + initialRecord.cartId);
          reads += 1;
          await apiHook();
          return clone(current);
        },
      };
    if (id === './config') return { getWarehouses: () => [warehouse] };
    if (id === './persistence') return { readWarehouseRecord: async () => clone(record) };
    if (id === './server')
      return {
        checkWarehouseStock: async (_warehouse, items) => {
          await stockHook();
          load('policy').assertStock(
            items.map((i) => ({
              key: 'p:' + i.productEntityId,
              name: 'Test',
              quantity: i.quantity,
            })),
            new Map([['p:91', available]]),
            'West',
          );
        },
      };
    if (['./authorization', './policy', './submission'].includes(id)) return load(id.slice(2));
    throw new Error('Unexpected dependency (network is prohibited): ' + id);
  };
  compiled._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
  return compiled.exports;
}
const { signValidationClaims } = load('authorization');
const { submissionSnapshot } = load('submission');
const { validateWarehouseCheckout } = load('validation');
function token(exp = Math.floor(Date.now() / 1000) + 300) {
  return signValidationClaims(
    { ...initialRecord, purpose: 'warehouse-validation', origin, exp },
    'warehouse-validation-v1:' + process.env.WAREHOUSE_VALIDATION_SECRET,
  );
}
function validate(snapshot = submissionSnapshot(current), access = token(), mode) {
  return validateWarehouseCheckout(
    access,
    origin,
    initialRecord.cartId,
    initialRecord.revision,
    mode,
    snapshot,
  );
}
beforeEach(() => {
  record = clone(initialRecord);
  available = 2;
  reads = 0;
  stockHook = async () => {};
  apiHook = async () => {};
  warehouse.allowShipping = false;
  current = {
    id: record.cartId,
    order_id: null,
    grand_total: 50,
    cart: {
      id: record.cartId,
      channel_id: 37,
      line_items: { physical_items: [{ id: 'line', product_id: 91, variant_id: 92, quantity: 1 }] },
    },
    consignments: [
      {
        id: 'consignment',
        line_item_ids: ['line'],
        selected_pickup_option: { pickup_method_id: 83 },
      },
    ],
  };
});
for (const mode of ['pickup-only', 'origin-pickup', 'origin-shipping'])
  test('accepts ready ' + mode, async () => {
    warehouse.allowShipping = mode !== 'pickup-only';
    if (mode === 'origin-shipping')
      current.consignments[0] = {
        id: 'consignment',
        line_item_ids: ['line'],
        selected_shipping_option: { id: 'freight', type: 'shipping_carrier' },
      };
    const result = await validate();
    assert.deepEqual(result.submission, submissionSnapshot(current));
    assert.equal(reads, 2);
  });
test('draft fulfillment remains valid for editing but fails submit readiness', async () => {
  delete current.consignments[0].selected_pickup_option;
  await validateWarehouseCheckout(token(), origin, record.cartId, record.revision);
  await assert.rejects(validate(), { code: 'SUBMISSION_CONFLICT' });
});
test('shipping at pickup-only location, wrong pickup, mixed choices and missing assignment fail', async () => {
  for (const consignment of [
    { selected_shipping_option: { id: 'freight', type: 'shipping_carrier' } },
    { selected_pickup_option: { pickup_method_id: 99 } },
    {
      selected_pickup_option: { pickup_method_id: 83 },
      selected_shipping_option: { id: 'freight', type: 'shipping_carrier' },
    },
    { selected_pickup_option: { pickup_method_id: 83 }, line_item_ids: [] },
  ]) {
    current.consignments = [{ id: 'consignment', line_item_ids: ['line'], ...consignment }];
    await assert.rejects(validate(), { code: 'SUBMISSION_CONFLICT' });
  }
});
test('a stale tab cannot submit after another tab changes warehouse revision', async () => {
  record.revision = 'b697cb1a-7da0-40a2-8e81-12e498e4b33e';
  await assert.rejects(validate(), { code: 'STALE_WAREHOUSE' });
  assert.equal(reads, 0);
});
test('warehouse revision changing during stock validation is detected', async () => {
  stockHook = async () => {
    record.revision = 'b697cb1a-7da0-40a2-8e81-12e498e4b33e';
  };
  await assert.rejects(validate(), { code: 'STALE_WAREHOUSE' });
});
for (const field of ['quantity', 'fulfillment', 'total'])
  test(field + ' changed before validation rejects the reviewed snapshot', async () => {
    const reviewed = submissionSnapshot(current);
    if (field === 'quantity') current.cart.line_items.physical_items[0].quantity = 2;
    if (field === 'fulfillment')
      current.consignments[0].selected_pickup_option.pickup_method_id = 99;
    if (field === 'total') current.grand_total = 55;
    await assert.rejects(validate(reviewed), { code: 'SUBMISSION_CONFLICT' });
  });
for (const field of ['quantity', 'fulfillment', 'total', 'order'])
  test(field + ' changed during stock validation is detected', async () => {
    stockHook = async () => {
      if (field === 'quantity') current.cart.line_items.physical_items[0].quantity = 2;
      if (field === 'fulfillment') delete current.consignments[0].selected_pickup_option;
      if (field === 'total') current.grand_total = 55;
      if (field === 'order') current.order_id = 999;
    };
    await assert.rejects(validate(), { code: 'SUBMISSION_CONFLICT' });
  });
test('insufficient inventory is rejected', async () => {
  available = 0;
  await assert.rejects(validate(), /0 available/);
});
test('expired authorization fails before any checkout reads', async () => {
  await assert.rejects(validate(submissionSnapshot(current), token(1)), { code: 'UNAUTHORIZED' });
  assert.equal(reads, 0);
});
test('backend unavailability fails closed', async () => {
  apiHook = async () => {
    throw new Error('simulated dependency unavailable');
  };
  await assert.rejects(validate(), /unavailable/);
});
test('mode-preflight cannot relax strict submission validation', async () => {
  await assert.rejects(validate(submissionSnapshot(current), token(), 'pickup'), {
    code: 'SUBMISSION_CONFLICT',
  });
});
test('documents that two concurrent validations are not an atomic reservation', async () => {
  const results = await Promise.all([validate(), validate()]);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0].submission, results[1].submission);
});
