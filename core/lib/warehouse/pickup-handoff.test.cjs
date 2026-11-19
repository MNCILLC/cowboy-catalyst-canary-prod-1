const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test, beforeEach } = require('node:test');
const ts = require('typescript');
function compile(name, deps) {
  const file = path.join(__dirname, name);
  const m = new Module(file, module);
  m.require = (id) => {
    if (Object.hasOwn(deps, id)) return deps[id];
    throw Error(id);
  };
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  return m.exports;
}
const policy = compile('policy.ts', {});
let consignments, calls, fail, malformed;
const { preparePickupOnlyHandoff } = compile('pickup-handoff.ts', {
  'server-only': {},
  './policy': policy,
  './api': {
    warehouseApi: async (url, method = 'GET', body) => {
      calls.push({ url, method, body });
      if (fail) throw Error('unavailable');
      if (method === 'GET') return { consignments };
      if (method === 'DELETE') consignments = [];
      if (method === 'POST')
        consignments = malformed
          ? []
          : [
              {
                id: 'native',
                line_item_ids: body[0].line_items.map((x) => x.item_id),
                selected_pickup_option: body[0].pickup_option,
              },
            ];
    },
  },
});
const warehouse = { id: 'remote', pickupMethodId: 72, allowShipping: false };
const items = [
  { id: 'line-a', quantity: 2 },
  { id: 'line-b', quantity: 1 },
];
const ready = async () => {};
beforeEach(() => {
  consignments = [];
  calls = [];
  fail = malformed = false;
});
test('fresh pickup-only cart gets native pickup with exact quantities', async () => {
  await preparePickupOnlyHandoff('synthetic', items, warehouse, ready);
  assert.deepEqual(calls.find((c) => c.method === 'POST').body, [
    {
      pickup_option: { pickup_method_id: 72 },
      line_items: [
        { item_id: 'line-a', quantity: 2 },
        { item_id: 'line-b', quantity: 1 },
      ],
    },
  ]);
});
test('retry preserves already matching native pickup', async () => {
  await preparePickupOnlyHandoff('synthetic', items, warehouse, ready);
  calls = [];
  await preparePickupOnlyHandoff('synthetic', items, warehouse, ready);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});
test('origin warehouse leaves shipping or pickup choice to checkout', async () => {
  await preparePickupOnlyHandoff('synthetic', items, { ...warehouse, allowShipping: true }, ready);
  assert.equal(calls.length, 0);
});
test('unselected shipping consignment is replaced before pickup', async () => {
  consignments = [{ id: 'shipping', line_item_ids: ['line-a', 'line-b'] }];
  await preparePickupOnlyHandoff('synthetic', items, warehouse, ready);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET', 'DELETE', 'POST', 'GET'],
  );
});
test('stale warehouse before preparation prevents writes', async () => {
  await assert.rejects(
    preparePickupOnlyHandoff('synthetic', items, warehouse, async () => {
      throw Error('stale');
    }),
    /stale/,
  );
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});
test('incorrect native readback fails closed', async () => {
  malformed = true;
  await assert.rejects(
    preparePickupOnlyHandoff('synthetic', items, warehouse, ready),
    /Unable to confirm/,
  );
});
test('native outage fails closed', async () => {
  fail = true;
  await assert.rejects(
    preparePickupOnlyHandoff('synthetic', items, warehouse, ready),
    /unavailable/,
  );
});
test('warehouse change after native write is detected', async () => {
  let checks = 0;
  await assert.rejects(
    preparePickupOnlyHandoff('synthetic', items, warehouse, async () => {
      if (++checks === 3) throw Error('stale');
    }),
    /stale/,
  );
});
