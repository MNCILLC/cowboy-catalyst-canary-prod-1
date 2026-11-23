/* eslint-disable no-await-in-loop, no-restricted-syntax -- Node-only process lifecycle and revision races must run in sequence. */
const assert = require('node:assert/strict');
const { fork, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const { redisClient } = require('./test-support.cjs');

const binary = process.env.ATOMIC_TEST_REDIS_SERVER;
const cli = process.env.ATOMIC_TEST_REDIS_CLI;

if (!binary || !cli)
  throw new Error('Set explicit ATOMIC_TEST_REDIS_SERVER and ATOMIC_TEST_REDIS_CLI paths');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-integration-'));
const socket = path.join(dir, 'redis.sock');
const client = redisClient(cli, socket);
const children = [];
let redis;
let a;
let b;
let sequence = 0;
const metrics = {
  pickerRaces: 0,
  stagingPickerRaces: 0,
  workerPids: [],
  externalHttpRequests: 0,
};

global.fetch = () => {
  metrics.externalHttpRequests += 1;
  throw new Error('External HTTP prohibited');
};

async function startRedis() {
  redis = spawn(
    binary,
    [
      '--port',
      '0',
      '--unixsocket',
      socket,
      '--unixsocketperm',
      '700',
      '--dir',
      dir,
      '--save',
      '',
      '--appendonly',
      'yes',
      '--appendfsync',
      'always',
      '--maxmemory-policy',
      'noeviction',
      '--logfile',
      path.join(dir, 'redis.log'),
    ],
    { stdio: 'ignore', env: { PATH: process.env.PATH } },
  );

  for (let i = 0; i < 100; i += 1) {
    if (redis.exitCode !== null) throw new Error(`Private Redis exited; see ${dir}`);

    try {
      if ((await client.command('PING')) === 'PONG') return;
    } catch {
      /* wait for private socket */
    }

    await delay(25);
  }

  throw new Error('Private Redis failed to start');
}

async function stopRedis(signal = 'SIGTERM') {
  if (!redis || redis.exitCode !== null) return;

  const exited = once(redis, 'exit');

  redis.kill(signal);
  await exited;
}

async function startWorker() {
  const child = fork(path.join(__dirname, 'integration-worker.cjs'), [], {
    env: { PATH: process.env.PATH, ATOMIC_TEST_REDIS_CLI: cli, ATOMIC_TEST_SOCKET: socket },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });

  children.push(child);

  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    const startupTimer = setTimeout(() => reject(new Error('Worker startup timed out')), 10000);

    child.once('error', (error) => {
      clearTimeout(startupTimer);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(startupTimer);
      reject(new Error('Worker exited before readiness'));
    });
    child.on('message', (message) => {
      if (message.ready) {
        clearTimeout(startupTimer);
        metrics.workerPids.push(message.pid);
        resolve();

        return;
      }

      const waiter = pending.get(message.id);

      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(message.id);
        waiter.resolve(message);
      }
    });
  });

  child.on('exit', (code) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: { code: 'PROCESS_EXIT', status: code } });
    }

    pending.clear();
  });
  await ready;

  return {
    child,
    call(action, payload) {
      return new Promise((resolve, reject) => {
        sequence += 1;

        const id = sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Worker request timed out'));
        }, 10000);

        pending.set(id, { resolve, timer });
        child.send({ id, action, payload });
      });
    },
  };
}

before(async () => {
  await startRedis();
  a = await startWorker();
  b = await startWorker();
});
after(async () => {
  for (const child of children) {
    // eslint-disable-next-line no-continue -- Do not signal workers already terminated by a crash test.
    if (child.exitCode !== null || child.signalCode !== null) continue;

    const exited = once(child, 'exit');

    child.kill();
    await exited;
  }

  await stopRedis();
  if (process.env.ATOMIC_TEST_REPORT)
    fs.writeFileSync(process.env.ATOMIC_TEST_REPORT, JSON.stringify(metrics, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(worker, action, payload) {
  const response = await worker.call(action, payload);

  assert.equal(response.ok, true, JSON.stringify(response.error));

  return response.result;
}

async function setup(initialize = true) {
  const cartId = randomUUID();

  await Promise.all([call(a, 'setup', { cartId }), call(b, 'setup', { cartId })]);

  const record = initialize ? await call(a, 'initialize') : undefined;

  return { cartId, record };
}

function selection(cartId, revision, warehouseId = 'powell') {
  return { warehouseId, expected: { cartId, revision, operationId: randomUUID() } };
}

async function expectError(worker, action, payload, code, status) {
  const result = await worker.call(action, payload);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  if (status) assert.equal(result.error.status, status);
}

test('new-cart initialization is visible across processes and repeated initialization is idempotent', async () => {
  const { record } = await setup();
  const other = await call(b, 'context');

  assert.equal(other.revision, record.revision);
  await call(a, 'patch', { stock: 0 });
  assert.deepEqual(await call(a, 'initialize'), record);
  assert.equal((await call(b, 'stats')).cookie, 'forney');
});

test('new shoppers use the enabled shipping origin for browsing and their first cart', async () => {
  const { cartId } = await setup(false);

  await call(a, 'patch', { sessionCartId: null, cookie: null });
  assert.equal((await call(a, 'context')).warehouse.id, 'forney');

  const firstAdd = await call(a, 'items', { newCart: true });

  assert.equal(firstAdd.id, 'forney');
  await call(a, 'initialize', { warehouseId: firstAdd.id });
  assert.equal((await call(b, 'context')).warehouse.id, 'forney');
  await call(a, 'patch', { forneyEnabled: false });
  assert.deepEqual(await call(a, 'context'), { cartId: null, revision: null });
  await call(a, 'patch', { forneyEnabled: true });
  assert.deepEqual(await call(a, 'select', selection(null, null, 'powell')), {});
  assert.equal((await call(a, 'items', { newCart: true })).id, 'powell');
  await call(a, 'patch', { sessionCartId: cartId });
  assert.equal((await call(a, 'context')).warehouse.id, 'forney');
});

test('signed-in warehouse switches preserve both carts and their revisions across workers', async () => {
  const customerId = 42;
  const fixture = (quantity) => ({
    id: randomUUID(),
    customer_id: customerId,
    channel_id: 37,
    line_items: {
      physical_items: [
        { id: randomUUID(), product_id: 9001, variant_id: 0, name: 'Test item', quantity },
      ],
      digital_items: [],
    },
  });
  const forney = fixture(2);
  const powell = fixture(1);

  await setup(false);
  await call(a, 'patch', { customerId, cart: forney, sessionCartId: forney.id });

  const original = await call(a, 'initialize');

  const legacyCart = fixture(3);

  await call(b, 'patch', {
    customerId,
    cart: legacyCart,
    sessionCartId: legacyCart.id,
    otherCarts: [forney],
  });
  assert.equal(
    (await call(b, 'select', selection(legacyCart.id, null, 'forney'))).code,
    'CART_CHANGED',
  );
  assert.equal((await call(b, 'context')).revision, null);

  await call(a, 'patch', { locationStock: { 102: { 9001: 0 } } });
  assert.deepEqual(await call(a, 'select', selection(forney.id, original.revision, 'powell')), {
    cartSwitched: true,
  });

  const empty = await call(a, 'context');

  assert.equal(empty.cartId, null);
  assert.equal(empty.warehouse.id, 'powell');
  assert.equal(
    (await call(a, 'select', selection(forney.id, original.revision, 'forney'))).code,
    'CART_CHANGED',
  );

  // First add in Powell creates its own cart. A second server can then restore either ID.
  await call(a, 'patch', { cart: powell, sessionCartId: powell.id, locationStock: {} });

  const pickup = await call(a, 'initialize', { warehouseId: 'powell' });

  await call(b, 'patch', {
    customerId,
    cart: powell,
    sessionCartId: powell.id,
    otherCarts: [forney],
  });
  assert.deepEqual(await call(b, 'select', selection(powell.id, pickup.revision, 'forney')), {
    cartSwitched: true,
  });
  assert.equal((await call(b, 'context')).cartId, forney.id);
  assert.equal((await call(b, 'context')).revision, original.revision);
  assert.deepEqual(await call(b, 'select', selection(forney.id, original.revision, 'powell')), {
    cartSwitched: true,
  });
  assert.equal((await call(b, 'context')).cartId, powell.id);
  assert.equal((await call(b, 'context')).revision, pickup.revision);

  // A deleted/converted native cart opens empty. Another shopper cannot open a parked cart.
  await call(b, 'patch', { otherCarts: [{ ...forney, customer_id: 43 }] });
  assert.equal(
    (await call(b, 'select', selection(powell.id, pickup.revision, 'forney'))).code,
    'INVALID_RECORD',
  );
  assert.equal((await call(b, 'context')).cartId, powell.id);
  await call(b, 'patch', { otherCarts: [] });
  assert.deepEqual(await call(b, 'select', selection(powell.id, pickup.revision, 'forney')), {
    cartSwitched: true,
  });
  assert.equal((await call(b, 'context')).cartId, null);
  await call(b, 'patch', { customerId: 43 });
  assert.deepEqual(await call(b, 'select', selection(null, null, 'powell')), {});
  assert.equal((await call(b, 'context')).cartId, null);
});

test('two first adds reserve one shopper cart and a second process can finish its initialization', async () => {
  const { cartId } = await setup(false);
  const customerId = 87;
  const cart = {
    id: cartId,
    customer_id: customerId,
    channel_id: 37,
    line_items: {
      physical_items: [{ id: 'line-1', product_id: 9001, variant_id: 0, quantity: 1 }],
      digital_items: [],
    },
  };
  const workers = [a, b];

  await Promise.all(
    workers.map((w) => call(w, 'patch', { customerId, cart, sessionCartId: null })),
  );

  const responses = await Promise.all(workers.map((w) => w.call('reserveFirstAdd')));

  assert.equal(responses.filter((r) => r.ok && r.result).length, 1);
  assert.equal(responses.find((r) => !r.ok).error.code, 'CART_CHANGED');

  const winner = workers[responses.findIndex((r) => r.ok)];
  const loser = winner === a ? b : a;

  // BigCommerce returned an ID, but stock verification then failed on the winning process.
  await call(winner, 'patch', { stock: 0 });
  assert.equal((await winner.call('completeFirstAdd')).ok, false);
  await expectError(loser, 'reserveFirstAdd', {}, 'CART_CHANGED', 409);
  assert.deepEqual(await call(loser, 'select', selection(null, null)), { cartSwitched: true });

  const recovered = await call(loser, 'context');

  assert.equal(recovered.cartId, cartId);
  assert.equal(recovered.warehouse.id, 'powell');
  await expectError(winner, 'reserveFirstAdd', {}, 'CART_CHANGED', 409);
});

test('a lost first-add response can recover only a matching cart with verified owner and channel', async () => {
  const { cartId } = await setup(false);
  const customerId = 88;
  const cart = {
    id: cartId,
    customer_id: customerId,
    channel_id: 37,
    line_items: {
      physical_items: [{ id: 'line-1', product_id: 9001, variant_id: 0, quantity: 1 }],
      digital_items: [],
    },
  };

  await Promise.all([a, b].map((w) => call(w, 'patch', { customerId, cart, sessionCartId: null })));
  assert.equal(await call(a, 'reserveFirstAdd'), true);

  const source = await call(a, 'loseFirstAdd');

  await expectError(b, 'reserveFirstAdd', {}, 'CART_CHANGED', 409);
  await call(b, 'patch', { source, cart: { ...cart, customer_id: customerId + 1 } });
  await expectError(b, 'reserveFirstAdd', {}, 'INVALID_RECORD', 409);
  await call(b, 'patch', { cart: { ...cart, channel_id: 99 } });
  await expectError(b, 'reserveFirstAdd', {}, 'INVALID_RECORD', 409);
  await call(b, 'patch', { cart });
  assert.equal(await call(b, 'reserveFirstAdd'), cart.id);
  await expectError(a, 'reserveFirstAdd', {}, 'CART_CHANGED', 409);
});

test('two picker actions pass their stock checks then race at CAS: exactly one wins', async () => {
  for (let i = 0; i < 12; i += 1) {
    const { cartId, record } = await setup();
    const left = selection(cartId, record.revision, 'powell');
    const right = selection(cartId, record.revision, 'forney');
    const armed = await Promise.all([
      call(a, 'arm', { ...left, boundary: 'cas' }),
      call(b, 'arm', { ...right, boundary: 'cas' }),
    ]);

    assert.notEqual(armed[0].pid, armed[1].pid);

    const results = await Promise.all([call(a, 'release'), call(b, 'release')]);

    assert.equal(results.filter((r) => !r.error).length, 1);
    assert.equal(results.find((r) => r.error).code, 'STALE_WAREHOUSE');

    const contexts = await Promise.all([call(a, 'context'), call(b, 'context')]);

    assert.deepEqual(contexts[0], contexts[1]);
    assert.notEqual(contexts[0].revision, record.revision);
    metrics.pickerRaces += 1;
  }
});

test('lost commit response retries on another process before stock/stale checks; old receipt never rolls back the head or cookie', async () => {
  const { cartId, record } = await setup();
  const attempt = selection(cartId, record.revision);

  await call(a, 'patch', { loseCommitResponse: true });

  const lost = await call(a, 'select', attempt);

  assert.equal(lost.code, 'WAREHOUSE_STORAGE_UNAVAILABLE');
  assert.equal(lost.retryable, true);

  const accepted = await call(b, 'context');

  assert.equal(accepted.warehouse.id, 'powell');
  await call(b, 'patch', { stock: 0 });
  assert.deepEqual(await call(b, 'select', attempt), {});
  assert.equal((await call(b, 'context')).revision, accepted.revision);
  await call(b, 'patch', { stock: 10 });
  assert.deepEqual(await call(b, 'select', selection(cartId, accepted.revision, 'forney')), {});

  const latest = await call(b, 'context');

  await call(a, 'patch', { stock: 0 });
  assert.deepEqual(await call(a, 'select', attempt), {});
  assert.equal((await call(a, 'context')).revision, latest.revision);
  assert.equal((await call(a, 'stats')).cookie, 'forney');

  const conflict = await call(a, 'select', { ...attempt, warehouseId: 'forney' });

  assert.equal(conflict.code, 'OPERATION_CONFLICT');
});

test('response revalidation failure can retry without changing the accepted revision', async () => {
  const { cartId, record } = await setup();
  const attempt = selection(cartId, record.revision);

  await call(a, 'patch', { revalidateFailure: true });
  assert.equal((await call(a, 'select', attempt)).retryable, true);

  const head = await call(b, 'context');

  await call(a, 'patch', { revalidateFailure: false });
  assert.deepEqual(await call(a, 'select', attempt), {});
  assert.equal((await call(a, 'context')).revision, head.revision);
});

test('actual picker retry helper retains the original payload across changed props and clears terminal retries', async () => {
  const { record } = await setup();
  const result = await call(a, 'clientRetry', { revision: record.revision });

  assert.deepEqual(result.calls[0], result.calls[1]);
  assert.equal(result.calls[1][1].revision, record.revision);
  assert.equal(result.retried.retry, undefined);
  assert.equal(result.conflict.retry, undefined);
  assert.deepEqual(result.unavailable.retry, result.attempt);
  assert.notEqual(result.next.expected.operationId, result.attempt.expected.operationId);
});

test('a disabled Powell selection is rejected and its cart can choose Forney', async () => {
  const { cartId, record } = await setup();

  assert.deepEqual(await call(a, 'select', selection(cartId, record.revision)), {});

  const saved = await call(b, 'context');
  const handoff = await call(b, 'handoff');

  await call(b, 'patch', { powellEnabled: false });

  const disabled = await call(b, 'context');

  assert.equal(disabled.warehouse, undefined);
  assert.equal(disabled.revision, saved.revision);
  assert.equal(
    (await call(b, 'validate', { access: handoff.access })).body.code,
    'WAREHOUSE_UNAVAILABLE',
  );
  assert.match((await call(b, 'select', selection(cartId, saved.revision))).error, /unavailable/);
  await call(b, 'patch', { powellEnabled: true });
  assert.deepEqual(await call(b, 'context'), saved);
  await call(b, 'patch', { powellEnabled: false });
  assert.deepEqual(await call(b, 'select', selection(cartId, saved.revision, 'forney')), {});
  assert.equal((await call(b, 'context')).warehouse.id, 'forney');
});

test('Powell pickup and Forney pickup/shipping preserve the standalone validation contract', async () => {
  const { cartId, record } = await setup();

  for (const [warehouseId, mode] of [
    ['forney', 'shipping'],
    ['forney', 'pickup'],
    ['powell', 'pickup'],
  ]) {
    if (warehouseId === 'powell')
      assert.deepEqual(await call(a, 'select', selection(cartId, record.revision)), {});
    await call(b, 'fulfillment', { warehouseId, mode });

    const handoff = await call(b, 'handoff');
    const result = await call(b, 'validate', { access: handoff.access, submit: true });

    assert.equal(result.status, 200);
    assert.equal(result.cache, 'no-store');
    assert.deepEqual(
      Object.keys(result.body).sort(),
      [
        'version',
        'cartId',
        'revision',
        'warehouse',
        'allowedModes',
        'expiresAt',
        'submission',
      ].sort(),
    );
    assert.equal(result.body.warehouse.id, warehouseId);
    assert.deepEqual(
      result.body.allowedModes,
      warehouseId === 'powell' ? ['pickup'] : ['shipping', 'pickup'],
    );
    if (warehouseId === 'powell')
      assert.equal(
        (await call(b, 'validate', { access: handoff.access, mode: 'shipping' })).body.code,
        'FULFILLMENT_CONFLICT',
      );
  }
});

test('new warehouse invalidates signed access and handoff replaces shipping with native pickup', async () => {
  const { cartId, record } = await setup();

  await call(b, 'fulfillment', { warehouseId: 'forney', mode: 'shipping' });

  const old = await call(b, 'handoff');

  await call(a, 'select', selection(cartId, record.revision));

  const stale = await call(b, 'validate', { access: old.access });

  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'STALE_WAREHOUSE');

  const previousStats = await call(b, 'stats');
  const fresh = await call(b, 'handoff');

  assert.equal((await call(b, 'stats')).consignmentDeletes, previousStats.consignmentDeletes + 1);
  assert.equal((await call(b, 'stats')).consignmentCreates, previousStats.consignmentCreates + 1);
  assert.equal((await call(b, 'validate', { access: fresh.access, submit: true })).status, 200);
});

test('warehouse change during submit validation is rejected by the final authoritative read', async () => {
  const { cartId, record } = await setup();

  await call(b, 'fulfillment', { warehouseId: 'forney', mode: 'pickup' });

  const handoff = await call(b, 'handoff');

  await call(b, 'arm', { boundary: 'stock', access: handoff.access, submit: true });
  assert.deepEqual(await call(a, 'select', selection(cartId, record.revision)), {});

  const result = await call(b, 'release');

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'STALE_WAREHOUSE');
});

test('an existing cart requires a stock-checked assignment even with a warehouse cookie', async () => {
  const { cartId } = await setup();
  const handoff = await call(b, 'handoff');

  await client.command('FLUSHDB'); // This private Unix-socket Redis contains synthetic records only.
  assert.deepEqual(await call(a, 'context'), { cartId, revision: null });
  for (const command of ['items', 'handoff', 'authorize'])
    await expectError(a, command, {}, 'WAREHOUSE_RECOVERY_REQUIRED', 409);

  const choice = selection(cartId, null);

  await call(a, 'patch', { stock: 0 });
  assert.equal((await call(a, 'select', choice)).code, 'INVENTORY_CONFLICT');
  assert.equal(await client.command('DBSIZE'), 0);
  assert.equal((await call(a, 'stats')).cookie, 'forney');

  await call(a, 'patch', { stock: 1 });
  assert.deepEqual(await call(a, 'select', choice), {});

  const recovered = await call(b, 'context');

  assert.equal(recovered.cartId, cartId);
  assert.equal(recovered.warehouse.id, 'powell');
  assert(recovered.revision);
  assert.deepEqual(await call(b, 'select', choice), {});
  assert.deepEqual(await call(a, 'context'), recovered);
  assert.equal((await call(b, 'validate', { access: handoff.access })).status, 409);
});

test('origin recovery checks every line and leaves a short cart available for another warehouse', async () => {
  const { cartId } = await setup(false);
  const cart = {
    id: cartId,
    channel_id: 37,
    version: 2,
    line_items: {
      physical_items: [
        { id: 'line-1', product_id: 9001, variant_id: 0, name: 'Synthetic product', quantity: 1 },
        {
          id: 'line-2',
          product_id: 9002,
          variant_id: 0,
          name: 'Second synthetic product',
          quantity: 2,
        },
      ],
      digital_items: [],
    },
  };

  await call(a, 'patch', { cart, cookie: 'powell', locationStock: { 1: { 9002: 1 } } });

  const unassigned = { cartId, revision: null, recoveryCartVersion: 2 };

  assert.deepEqual(await call(a, 'context'), unassigned);

  const origin = selection(cartId, null, 'forney');
  const shortage = await call(a, 'select', origin);

  assert.equal(shortage.code, 'INVENTORY_CONFLICT');
  assert.match(
    shortage.error,
    /Second synthetic product: 1 available at Ship\/Pickup Forney; 2 requested/,
  );
  assert.deepEqual(await call(a, 'context'), unassigned);
  assert.deepEqual(await call(a, 'select', selection(cartId, null, 'powell')), {});
  assert.equal((await call(b, 'context')).warehouse.id, 'powell');

  const fresh = await setup(false);

  await call(a, 'patch', { cart: { ...cart, id: fresh.cartId }, cookie: 'powell' });
  assert.deepEqual(await call(a, 'select', selection(fresh.cartId, null, 'forney')), {});
  assert.equal((await call(b, 'context')).warehouse.id, 'forney');
});

test('an edit during recovery leaves the cart unassigned and a second tab cannot overwrite a recovered cart', async () => {
  const { cartId } = await setup(false);
  const attempt = selection(cartId, null);

  await call(a, 'arm', { ...attempt, operation: 'select', boundary: 'stock' });
  await call(a, 'patch', {
    cart: { id: cartId, channel_id: 37, line_items: { physical_items: [], digital_items: [] } },
  });
  assert.equal((await call(a, 'release')).code, 'CART_CHANGED');
  assert.deepEqual(await call(b, 'context'), { cartId, revision: null });

  await call(a, 'setup', { cartId });
  await call(b, 'arm', { ...selection(cartId, null, 'forney'), boundary: 'cas' });
  assert.deepEqual(await call(a, 'select', attempt), {});
  assert.equal((await call(b, 'release')).code, 'STALE_WAREHOUSE');
  assert.equal((await call(b, 'context')).warehouse.id, 'powell');
});

test('Redis outage blocks context, picker, handoff, and validator without metadata fallback', async () => {
  const { cartId, record } = await setup();
  const handoff = await call(a, 'handoff');
  const previousStats = await call(a, 'stats');

  await call(a, 'patch', { outage: true });
  for (const command of ['context', 'items', 'handoff'])
    await expectError(a, command, {}, 'WAREHOUSE_STORAGE_UNAVAILABLE', 503);
  assert.equal((await call(a, 'select', selection(cartId, record.revision))).retryable, true);
  assert.equal((await call(a, 'validate', { access: handoff.access })).status, 503);

  const afterStats = await call(a, 'stats');

  assert.equal(afterStats.metafieldCalls, previousStats.metafieldCalls);
  assert.equal((await call(b, 'context')).revision, record.revision);
});

test('stock failure, stale revision, invalid operation, wrong cart, and wrong channel cannot mutate authority', async () => {
  const { cartId, record } = await setup();

  await call(a, 'patch', { stock: 0 });
  assert.equal(
    (await call(a, 'select', selection(cartId, record.revision))).code,
    'INVENTORY_CONFLICT',
  );
  assert.equal((await call(a, 'select', selection(cartId, randomUUID()))).code, 'STALE_WAREHOUSE');
  assert.equal(
    (await call(a, 'select', selection(randomUUID(), record.revision))).code,
    'CART_CHANGED',
  );

  const bad = selection(cartId, record.revision);

  bad.expected.operationId = 'bad';
  assert.equal((await call(a, 'select', bad)).code, 'INVALID_SELECTION_REQUEST');
  await call(a, 'setup', { cartId, channelId: 99 });
  assert((await call(a, 'select', selection(cartId, record.revision))).error);
  assert.equal((await call(b, 'context')).revision, record.revision);
  await call(b, 'patch', { stock: 0 });
  await expectError(b, 'items', {}, undefined);
});

test('provider/config errors fail closed; no Redis activation outside local preview', async () => {
  const { record } = await setup();

  for (const env of [
    { WAREHOUSE_PERSISTENCE_PROVIDER: 'typo' },
    { WAREHOUSE_PERSISTENCE_PROVIDER: 'redis', NODE_ENV: 'production', WAREHOUSE_MODE: null },
    { NODE_ENV: 'development', WAREHOUSE_MODE: 'preview', WAREHOUSE_REDIS_TOKEN: '' },
  ]) {
    await call(a, 'env', env);
    await expectError(a, 'context', {}, 'WAREHOUSE_STORAGE_UNAVAILABLE', 503);
  }

  await call(a, 'env', { WAREHOUSE_REDIS_TOKEN: 'synthetic-token' });
  assert.equal((await call(a, 'context')).revision, record.revision);
});

test('pre-cart cookie preference creates no authority, and default legacy provider still uses metadata', async () => {
  await setup(false);
  await call(a, 'patch', { sessionCartId: null });
  assert.deepEqual(await call(a, 'select', selection(null, null)), {});

  const context = await call(a, 'context');

  assert.equal(context.cartId, null);
  assert.equal(context.warehouse.id, 'powell');
  await call(a, 'env', { WAREHOUSE_PERSISTENCE_PROVIDER: null });
  await call(a, 'setup', { cartId: randomUUID() });

  const record = await call(a, 'initialize');

  assert.equal((await call(a, 'context')).revision, record.revision);
  assert((await call(a, 'stats')).metafieldCalls > 0);
  await call(a, 'env', { WAREHOUSE_PERSISTENCE_PROVIDER: 'redis' });
});

test('accepted operation retries still require the matching authenticated cart and channel', async () => {
  const { cartId, record } = await setup();
  const attempt = selection(cartId, record.revision);

  assert.deepEqual(await call(a, 'select', attempt), {});

  const head = await call(a, 'context');

  await call(b, 'setup', { cartId: randomUUID() });
  assert.equal((await call(b, 'select', attempt)).code, 'CART_CHANGED');
  await call(b, 'setup', { cartId, channelId: 99 });
  assert((await call(b, 'select', attempt)).error);
  assert.equal((await call(a, 'context')).revision, head.revision);
});

test('signed access remains origin-bound and validation rechecks stock', async () => {
  await setup();

  const handoff = await call(a, 'handoff');
  const wrongOrigin = await call(b, 'validate', {
    access: handoff.access,
    origin: 'http://localhost:9999',
  });

  assert.equal(wrongOrigin.status, 401);
  await call(b, 'patch', { stock: 0 });

  const empty = await call(b, 'validate', { access: handoff.access });

  assert.equal(empty.status, 409);
  assert.equal(empty.body.code, 'INVENTORY_CONFLICT');
});

test('handoff cannot mix a warehouse from an older read with a newer record', async () => {
  const { cartId, record } = await setup();

  await call(b, 'arm', { boundary: 'read' });
  assert.deepEqual(await call(a, 'select', selection(cartId, record.revision)), {});
  await expectError(b, 'release', {}, 'STALE_WAREHOUSE', 409);
});

test('cart inventory checks reject a warehouse change during their stock read', async () => {
  const { cartId, record } = await setup();

  await call(b, 'arm', { boundary: 'stock', operation: 'items' });
  assert.deepEqual(await call(a, 'select', selection(cartId, record.revision)), {});
  await expectError(b, 'release', {}, 'STALE_WAREHOUSE', 409);
});

test('isolation audit: two distinct processes, zero external requests and no unexpected API calls', async () => {
  assert.equal(new Set(metrics.workerPids).size, 2);

  for (const worker of [a, b]) {
    const stats = await call(worker, 'stats');

    metrics.backendStats = [...(metrics.backendStats ?? []), stats];

    assert.equal(stats.externalRequests, 0);
    assert.equal(stats.forbiddenCalls, 0);
  }

  assert.equal(metrics.pickerRaces, 12);
});

test('multi-location and its staging alias share handoff, validation and stale selections across processes', async () => {
  const staging = {
    NODE_ENV: 'production',
    WAREHOUSE_MODE: 'staging',
    BIGCOMMERCE_CHANNEL_ID: '37',
    WAREHOUSE_VALIDATION_BASE_URL: 'https://storefront.invalid',
    WAREHOUSE_CHECKOUT_ORIGINS: '["https://checkout.invalid"]',
  };

  await Promise.all([
    call(a, 'env', { ...staging, WAREHOUSE_MODE: 'multi-location' }),
    call(b, 'env', staging),
  ]);

  try {
    const { cartId, record } = await setup();
    const handoff = await call(a, 'handoff');

    assert.equal(handoff.access.endpoint, 'https://storefront.invalid/api/warehouse/validate');
    assert.equal((await call(b, 'validate', { access: handoff.access })).status, 200);
    assert.equal(
      (await call(b, 'validate', { access: handoff.access, origin: 'https://other.invalid' }))
        .status,
      403,
    );
    await call(b, 'env', { BIGCOMMERCE_CHANNEL_ID: '38' });
    assert.equal((await call(b, 'validate', { access: handoff.access })).status, 401);
    await call(b, 'env', { BIGCOMMERCE_CHANNEL_ID: '37' });
    assert.deepEqual(await call(b, 'select', selection(cartId, record.revision)), {});
    assert.equal((await call(a, 'validate', { access: handoff.access })).status, 409);
    assert.equal(
      (await call(a, 'select', selection(cartId, record.revision))).code,
      'STALE_WAREHOUSE',
    );

    const head = await call(a, 'context');

    await Promise.all([
      call(a, 'arm', { ...selection(cartId, head.revision, 'forney'), boundary: 'cas' }),
      call(b, 'arm', { ...selection(cartId, head.revision, 'powell'), boundary: 'cas' }),
    ]);

    const raced = await Promise.all([call(a, 'release'), call(b, 'release')]);

    assert.equal(raced.filter((result) => !result.error).length, 1);
    assert.equal(raced.find((result) => result.error).code, 'STALE_WAREHOUSE');
    metrics.pickerRaces += 1;
    metrics.stagingPickerRaces += 1;
    assert.equal((await call(a, 'stats')).externalRequests, 0);
    assert.equal((await call(b, 'stats')).externalRequests, 0);
  } finally {
    const restore = {
      NODE_ENV: 'development',
      WAREHOUSE_MODE: 'preview',
      WAREHOUSE_VALIDATION_BASE_URL: null,
      WAREHOUSE_CHECKOUT_ORIGINS: null,
    };

    await Promise.all([call(a, 'env', restore), call(b, 'env', restore)]);
  }
});

test('initialization authorizes the session and latest Redis state without mutating fulfillment', async () => {
  const { cartId, record } = await setup();

  await call(a, 'fulfillment', { mode: 'pickup', warehouseId: 'powell' });

  const priorStats = await call(a, 'stats');
  const authorized = await call(a, 'authorize');

  assert.equal(authorized.record.revision, record.revision);
  assert.equal((await call(a, 'stats')).consignmentDeletes, priorStats.consignmentDeletes);
  await call(a, 'patch', { sessionCartId: randomUUID() });
  assert.equal((await a.call('authorize')).ok, false);
  await call(a, 'patch', { sessionCartId: cartId });
  await call(b, 'arm', { boundary: 'stock', operation: 'authorize' });
  await call(a, 'select', selection(cartId, record.revision));
  await expectError(b, 'release', {}, 'STALE_WAREHOUSE', 409);

  const newest = await call(b, 'authorize');

  assert.equal(newest.warehouse.id, 'powell');
  await call(b, 'patch', { stock: 0 });
  assert.equal((await b.call('authorize')).ok, false);
  assert.equal((await call(a, 'stats')).externalRequests, 0);
  assert.equal((await call(b, 'stats')).externalRequests, 0);
});
