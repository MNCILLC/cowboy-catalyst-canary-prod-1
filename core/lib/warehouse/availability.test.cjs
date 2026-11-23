const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test, beforeEach } = require('node:test');
const ts = require('typescript');

let enabled;
let context;
let requests;
let fail;
let malformed;
let paginated;
const warehouse = { id: 'forney', label: 'Ship/Pickup from Forney, TX', locationId: 11 };
const pickupWarehouse = { id: 'powell', label: 'Pickup from Powell, WY', locationId: 22 };

function compile(name, dependencies) {
  const file = path.join(__dirname, name);
  const compiled = new Module(file, module);

  compiled.require = (id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (id === 'zod') return require('zod');
    throw new Error(`Unexpected dependency: ${id}`);
  };

  // eslint-disable-next-line no-underscore-dangle -- Execute the actual module with explicit fixtures, never live APIs.
  compiled._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

  return compiled.exports;
}

const policy = compile('availability-policy.ts', {});
const { getWarehouseAvailability } = compile('availability.ts', {
  'server-only': {},
  react: { cache: (fn) => fn },
  './availability-policy': policy,
  './config': { warehousePreviewEnabled: () => enabled },
  './locations': {
    getWarehouseLocations: async () => ({
      mapAddresses: new Map([
        [11, { cityState: 'Forney, TX' }],
        [22, { cityState: 'Powell, WY' }],
      ]),
    }),
  },
  './server': {
    getWarehouseContext: async () => {
      if (context instanceof Error) throw context;

      return context;
    },
  },
  './api': {
    warehouseApi: async (url) => {
      requests.push(url);
      if (fail) throw new Error('private upstream details must not reach shopper');

      const params = new URL(url, 'https://test.invalid').searchParams;

      if (url.startsWith('catalog/products'))
        return params
          .get('id:in')
          .split(',')
          .map(Number)
          .map((id) => ({
            id,
            type: 'physical',
            inventory_tracking: paginated ? 'variant' : 'product',
          }));
      if (malformed)
        return [{ identity: { product_id: 1, variant_id: null }, available_to_sell: 'bad' }];
      if (paginated)
        return Number(params.get('page')) === 1
          ? Array.from({ length: 250 }, (_, i) => ({
              identity: { product_id: 1, variant_id: i + 1 },
              available_to_sell: 0,
            }))
          : [{ identity: { product_id: 1, variant_id: 251 }, available_to_sell: 6 }];

      return params
        .get('product_id:in')
        .split(',')
        .map(Number)
        .map((id) => ({
          identity: { product_id: id, variant_id: null },
          available_to_sell: url.includes('/11/') ? 4 : 0,
        }));
    },
  },
});

beforeEach(() => {
  enabled = true;
  context = { warehouse };
  requests = [];
  fail = false;
  malformed = false;
  paginated = false;
});
test('off mode does not read inventory and leaves existing UI untouched', async () => {
  enabled = false;
  assert.equal((await getWarehouseAvailability([1]))(1), undefined);
  assert.equal(requests.length, 0);
});
test('no selection prompts for a warehouse without fetching catalog inventory', async () => {
  context = {};

  const result = (await getWarehouseAvailability([1]))(1);

  assert.equal(result.selectionRequired, 'warehouse');
  assert.equal(result.canPurchase, false);
  assert.equal(requests.length, 0);
});
['true', 'false', undefined].forEach((flag) => {
  test(`warehouse page and card stock messages with ENABLE_IN_STOCK_MESSAGE=${flag ?? 'unset'}`, async (t) => {
    const original = process.env.ENABLE_IN_STOCK_MESSAGE;

    t.after(() => {
      if (original === undefined) delete process.env.ENABLE_IN_STOCK_MESSAGE;
      else process.env.ENABLE_IN_STOCK_MESSAGE = original;
    });
    if (flag === undefined) delete process.env.ENABLE_IN_STOCK_MESSAGE;
    else process.env.ENABLE_IN_STOCK_MESSAGE = flag;

    const north = (await getWarehouseAvailability([1]))(1);
    const expected = flag === 'true' ? 'IN STOCK · Forney, TX' : '4 available · Forney, TX';

    assert.equal(north.message, expected);
    assert.equal(policy.warehouseCardDisplay(north).stockDisplayData.stockLevelMessage, expected);
    assert.equal(north.quantity, 4);
    assert.equal(north.canPurchase, true);

    context = { warehouse: pickupWarehouse };

    const south = (await getWarehouseAvailability([1]))(1);

    assert.equal(south.message, 'Out of stock · Powell, WY');
    assert.equal(south.canPurchase, false);
  });
});
test('batches cards and reads the authoritative location again on a new request', async () => {
  const first = await getWarehouseAvailability([2, 1, 2]);

  assert.equal(requests.length, 2);
  assert.equal(first(1).quantity, 4);
  assert.match(requests[1], /locations\/11\/items.*product_id:in=1,2/);
  context = { warehouse: pickupWarehouse };

  const second = await getWarehouseAvailability([1]);

  assert.equal(second(1).quantity, 0);
  assert.equal(second(1).message, 'Out of stock · Powell, WY');
});
test('stock messages omit the location suffix when no public city or state is available', async () => {
  context = { warehouse: { ...warehouse, locationId: 33 } };

  const availability = await getWarehouseAvailability([1]);

  assert.equal(availability(1).message, 'Out of stock');
  paginated = true;

  const variants = await getWarehouseAvailability([1]);

  assert.equal(variants(1).message, 'Options available. Choose options to check stock.');
});
test('pagination reaches a selected variant beyond the first inventory page', async () => {
  paginated = true;

  const result = await getWarehouseAvailability([1]);

  assert.equal(result(1, 251).quantity, 6);
  assert.equal(result(1, 1).quantity, 0);
  assert.equal(requests.length, 3);
});
test('large collections are split into bounded batches', async () => {
  const result = await getWarehouseAvailability(Array.from({ length: 51 }, (_, i) => i + 1));

  assert.equal(requests.length, 4);
  assert.equal(result(51).quantity, 4);
});
test('API failures, malformed stock and missing session authority never use aggregate stock', async () => {
  fail = true;
  assert.deepEqual((await getWarehouseAvailability([1]))(1), policy.unknownAvailability());
  fail = false;
  malformed = true;
  assert.deepEqual((await getWarehouseAvailability([1]))(1), policy.unknownAvailability());
  context = new Error('private cart details');
  assert.deepEqual((await getWarehouseAvailability([1]))(1), policy.unknownAvailability());
});
