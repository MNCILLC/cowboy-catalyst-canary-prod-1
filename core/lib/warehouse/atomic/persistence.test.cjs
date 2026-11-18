/* eslint-disable no-await-in-loop, no-restricted-syntax -- Node-only process lifecycle and revision races must run in sequence. */
const assert = require('node:assert/strict');
const { fork, spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const { loadAdapter, redisClient } = require('./test-support.cjs');

const {
  AtomicWarehousePersistence,
  assertCurrentRecord,
  signValidationClaims,
  verifyValidationClaims,
} = loadAdapter();

const binary = process.env.ATOMIC_TEST_REDIS_SERVER;
const cli = process.env.ATOMIC_TEST_REDIS_CLI;

if (!binary || !cli)
  throw new Error('Set explicit ATOMIC_TEST_REDIS_SERVER and ATOMIC_TEST_REDIS_CLI paths');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-atomic-'));
const socket = path.join(dir, 'redis.sock');
const client = redisClient(cli, socket);
const namespace = 'synthetic-warehouse-test';
const adapter = new AtomicWarehousePersistence(client, { namespace });
const children = [];
let redis;
let a;
let b;
let sequence = 0;
const metrics = {
  simultaneousCreationRaces: 0,
  simultaneousUpdateRaces: 0,
  workerPids: [],
  externalHttpRequests: 0,
};

global.fetch = () => {
  metrics.externalHttpRequests += 1;
  throw new Error('External HTTP prohibited');
};

function scope(overrides = {}) {
  return { storeHash: 'synthetic-store', channelId: 37, cartId: randomUUID(), ...overrides };
}

function request(identity, expectedRevision = null, warehouseId = 'north') {
  return { ...identity, expectedRevision, warehouseId, operationId: randomUUID() };
}

function key(identity) {
  return `${namespace}:{${createHash('sha256')
    .update(JSON.stringify([identity.storeHash, identity.channelId, identity.cartId]))
    .digest('hex')}}`;
}

function isError(result, code, status) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  if (status) assert.equal(result.error.status, status);
}

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

async function worker() {
  const child = fork(path.join(__dirname, 'worker.cjs'), [], {
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

async function race(left, right) {
  const armed = await Promise.all([a.call('arm', left), b.call('arm', right)]);

  assert(armed.every((r) => r.ok));
  assert.notEqual(armed[0].result.pid, armed[1].result.pid);
  assert.deepEqual(armed[0].result.observed, armed[1].result.observed);

  const results = await Promise.all([a.call('release'), b.call('release')]);

  assert.equal(results.filter((r) => r.ok).length, 1);
  isError(
    results.find((r) => !r.ok),
    'STALE_WAREHOUSE',
    409,
  );

  const winner = results.find((r) => r.ok).result.record;
  const { storeHash, channelId, cartId } = left;
  const reads = await Promise.all([
    a.call('read', { storeHash, channelId, cartId }),
    b.call('read', { storeHash, channelId, cartId }),
  ]);

  for (const read of reads) {
    assert(read.ok);
    assert.deepEqual(read.result, winner);
  }

  return winner;
}

before(async () => {
  await startRedis();
  a = await worker();
  b = await worker();
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

test('private Redis has TCP disabled, no eviction, and durable append-only writes', async () => {
  for (const [option, expected] of [
    ['port', '0'],
    ['maxmemory-policy', 'noeviction'],
    ['appendonly', 'yes'],
    ['appendfsync', 'always'],
  ]) {
    const value = await client.command('CONFIG', 'GET', option);

    assert.equal(Array.isArray(value) ? value[1] : value[option], expected);
  }
});
test('two processes race first creation: exactly one winner in each of 20 rounds', async () => {
  for (let i = 0; i < 20; i += 1) {
    const id = scope();

    await race(request(id, null, 'north'), request(id, null, 'south'));
    metrics.simultaneousCreationRaces += 1;
  }
});
test('two processes race updates from the same revision: exactly one winner in each of 40 rounds', async () => {
  const id = scope();
  let current = (await adapter.compareAndSet(request(id))).record;

  for (let i = 0; i < 40; i += 1) {
    current = await race(
      request(id, current.revision, 'north'),
      request(id, current.revision, 'south'),
    );
    metrics.simultaneousUpdateRaces += 1;
  }
});
test('same operation submitted concurrently commits once and returns the same revision', async () => {
  const input = request(scope());
  const [left, right] = await Promise.all([a.call('select', input), b.call('select', input)]);

  assert(left.ok && right.ok);
  assert.deepEqual(left.result.record, right.result.record);
  assert.equal([left, right].filter((r) => r.result.replayed).length, 1);
});
test('lost response after commit returns 503, then a retry on the other process returns the original result', async () => {
  const id = scope();
  const input = request(id);

  isError(await a.call('lostResponse', input), 'WAREHOUSE_STORAGE_UNAVAILABLE', 503);

  const committed = await adapter.read(id);
  const retried = await b.call('select', input);

  assert(retried.ok && retried.result.replayed);
  assert.deepEqual(retried.result.record, committed);
});
test('a reused operation ID with a different payload is rejected without changing the head', async () => {
  const id = scope();
  const input = request(id);
  const accepted = await adapter.compareAndSet(input);

  isError(await b.call('select', { ...input, warehouseId: 'south' }), 'OPERATION_CONFLICT', 409);
  assert.deepEqual(await adapter.read(id), accepted.record);
});
test('replaying an older successful operation returns its receipt and the newer head without rolling back', async () => {
  const id = scope();
  const old = request(id);
  const accepted = await adapter.compareAndSet(old);
  const latest = await adapter.compareAndSet(request(id, accepted.record.revision, 'south'));
  const replay = await b.call('select', old);

  assert(replay.ok && replay.result.replayed);
  assert.deepEqual(replay.result.record, accepted.record);
  assert.deepEqual(replay.result.currentRecord, latest.record);
  assert.deepEqual(await adapter.read(id), latest.record);
});
test('accepted updates invalidate old signed checkout capabilities using the existing authorization check', async () => {
  const id = scope();
  const old = (await adapter.compareAndSet(request(id))).record;
  const secret = 'synthetic-secret-for-offline-test-only';
  const claims = {
    ...old,
    purpose: 'warehouse-validation',
    origin: 'https://checkout.example',
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  const token = signValidationClaims(claims, secret);

  await b.call('select', request(id, old.revision, 'south'));

  const verified = verifyValidationClaims(token, secret, claims.origin);

  assert.throws(() => assertCurrentRecord(undefined, verified), { code: 'STALE_WAREHOUSE' });

  const head = await adapter.read(id);

  assert.throws(() => assertCurrentRecord(head, verified), { code: 'STALE_WAREHOUSE' });
});
test('UUID case aliases share the same cart authority, revision and retry receipt', async () => {
  const id = scope();
  const input = request(id);
  const accepted = await adapter.compareAndSet(input);
  const replay = await b.call('select', {
    ...input,
    cartId: input.cartId.toUpperCase(),
    operationId: input.operationId.toUpperCase(),
  });

  assert(replay.ok && replay.result.replayed);
  assert.deepEqual(replay.result.record, accepted.record);

  const updated = await a.call('select', {
    ...request(id, accepted.record.revision, 'south'),
    expectedRevision: accepted.record.revision.toUpperCase(),
  });

  assert(updated.ok);
  assert.deepEqual(
    await adapter.read({ ...id, cartId: id.cartId.toUpperCase() }),
    updated.result.record,
  );
});

test('store, channel, cart and deployment namespace do not share revisions or receipts', async () => {
  const id = scope();
  const operationId = randomUUID();
  const identities = [
    id,
    { ...id, storeHash: 'another-store' },
    { ...id, channelId: 38 },
    { ...id, cartId: randomUUID() },
  ];
  const results = await Promise.all(
    identities.map((identity) => adapter.compareAndSet({ ...request(identity), operationId })),
  );

  assert.equal(new Set(results.map((r) => r.record.revision)).size, 4);

  const isolated = new AtomicWarehousePersistence(client, {
    namespace: 'another-synthetic-deployment',
  });

  assert.equal(await isolated.read(id), undefined);
});
test('process termination before commit leaves the record unchanged', async () => {
  const id = scope();
  const saved = (await adapter.compareAndSet(request(id))).record;

  isError(await a.call('exitBefore', request(id, saved.revision)), 'PROCESS_EXIT');
  a = await worker();
  assert.deepEqual((await a.call('read', id)).result, saved);
});
test('process termination after commit preserves authority and retry receipts', async () => {
  const id = scope();
  const input = request(id);

  isError(await a.call('exitAfterCommit', input), 'PROCESS_EXIT');
  a = await worker();

  const replay = await a.call('select', input);

  assert(replay.ok && replay.result.replayed);
  assert.deepEqual((await b.call('read', id)).result, replay.result.record);
});
test('Redis outage fails closed for reads and writes; restart preserves the head and receipt', async () => {
  const id = scope();
  const input = request(id);
  const saved = (await adapter.compareAndSet(input)).record;

  await stopRedis();

  try {
    isError(await a.call('read', id), 'WAREHOUSE_STORAGE_UNAVAILABLE', 503);
    isError(
      await b.call('select', request(id, saved.revision, 'south')),
      'WAREHOUSE_STORAGE_UNAVAILABLE',
      503,
    );
  } finally {
    await startRedis();
  }

  assert.deepEqual((await a.call('read', id)).result, saved);

  const replay = await b.call('select', input);

  assert(replay.ok && replay.result.replayed);
  assert.deepEqual(replay.result.record, saved);
});
test('Redis crash and AOF restart retain the acknowledged revision and idempotency receipt', async () => {
  const id = scope();
  const input = request(id);
  const accepted = await adapter.compareAndSet(input);

  await stopRedis('SIGKILL');
  await startRedis();
  assert.deepEqual((await a.call('read', id)).result, accepted.record);

  const replay = await b.call('select', input);

  assert(replay.ok && replay.result.replayed);
  assert.deepEqual(replay.result.record, accepted.record);
});

test('a missing record cannot be updated with an old expected revision', async () => {
  const id = scope();

  isError(await a.call('select', request(id, randomUUID())), 'STALE_WAREHOUSE', 409);
  assert.equal(await adapter.read(id), undefined);
});
test('corrupt, mismatched, orphaned or expiring records fail closed without repair writes', async () => {
  for (const kind of ['json', 'identity', 'orphan', 'ttl']) {
    const id = scope();
    const initial = await adapter.compareAndSet(request(id));
    const redisKey = key(id);

    if (kind === 'json') await client.command('HSET', redisKey, 'record', '{broken');
    if (kind === 'identity')
      await client.command(
        'HSET',
        redisKey,
        'record',
        JSON.stringify({ ...initial.record, channelId: 999 }),
      );
    if (kind === 'orphan') await client.command('HDEL', redisKey, 'record');
    if (kind === 'ttl') await client.command('PEXPIRE', redisKey, 60000);

    const snapshotBefore = await client.command('HGETALL', redisKey);

    isError(await a.call('read', id), 'INVALID_RECORD', 503);
    isError(await b.call('select', request(id, initial.record.revision)), 'INVALID_RECORD', 503);
    assert.deepEqual(await client.command('HGETALL', redisKey), snapshotBefore);
  }
});
test('operation ledger is bounded without silently evicting receipts or the current record', async () => {
  const limited = new AtomicWarehousePersistence(client, { namespace, maxOperations: 2 });
  const id = scope();
  const firstInput = request(id);
  const first = await limited.compareAndSet(firstInput);
  const second = await limited.compareAndSet(request(id, first.record.revision));

  await assert.rejects(limited.compareAndSet(request(id, second.record.revision)), {
    code: 'SELECTION_LIMIT',
  });
  assert((await limited.compareAndSet(firstInput)).replayed);
  assert.deepEqual(await limited.read(id), second.record);
  assert.equal(await client.command('PTTL', key(id)), -1);
});
test('invalid requests and malformed transport responses cannot write or fall back', async () => {
  let calls = 0;
  const guarded = new AtomicWarehousePersistence({
    eval: async () => {
      calls += 1;

      return null;
    },
  });

  await assert.rejects(guarded.compareAndSet({ ...request(scope()), operationId: 'bad' }), {
    code: 'INVALID_SELECTION_REQUEST',
  });
  assert.equal(calls, 0);
  await assert.rejects(guarded.read(scope()), { code: 'WAREHOUSE_STORAGE_UNAVAILABLE' });
  assert.equal(calls, 1);
});
