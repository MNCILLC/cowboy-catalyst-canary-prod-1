/* eslint-disable no-await-in-loop, no-restricted-syntax -- Isolated fixtures and local Redis lifecycle. */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { test, beforeEach, after } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const ts = require('typescript');

const { redisClient } = require('./atomic/test-support.cjs');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

global.fetch = () => {
  throw new Error('External network forbidden');
};

after(() => {
  global.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

let current;
let policy;
let reads;
let validations;
let attempts;
let mutate;
let validationError;
let redisError;
const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name).exports;

  const file = path.join(__dirname, `${name}.ts`);
  const mod = new Module(file, module);

  cache.set(name, mod);

  mod.require = (id) => {
    if (id === 'server-only') return {};
    if (id === 'node:crypto') return require('node:crypto');
    if (id === 'zod') return require('zod');
    if (id === './api')
      return {
        warehouseApi: async () => {
          reads += 1;

          return structuredClone(current);
        },
      };
    if (id === './config')
      return {
        getWarehouseConfiguration: () => ({
          mode: 'staging',
          storeHash: 'test-store',
          channelId: 37,
        }),
      };
    if (id === './validation')
      return {
        validateWarehouseCheckout: async () => {
          validations += 1;
          if (mutate) mutate();
          if (validationError) throw validationError;
        },
      };
    if (id === '@upstash/redis')
      return {
        Redis: class {
          async eval() {
            attempts += 1;
            if (redisError) throw redisError;

            return attempts === 1 ? 1 : 0;
          }
        },
      };
    if (['./check-test', './authorization', './policy', './submission'].includes(id))
      return load(id.slice(2));
    throw new Error(`Forbidden dependency: ${id}`);
  };

  // eslint-disable-next-line no-underscore-dangle -- Compile only allowlisted modules, without env files/live transports.
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

  return mod.exports;
}

const pure = load('check-test');
const { authorizeCheckTest } = load('check-test-server');
const { submissionSnapshot } = load('submission');
const origin = 'https://checkout.example';
const secret = 'synthetic-signing-secret-never-a-live-credential';

beforeEach(() => {
  delete process.env.WAREHOUSE_TEST_PROVIDER_POLICY;
  policy = {
    id: '11111111-1111-4111-8111-111111111111',
    storeHash: 'test-store',
    channelId: 37,
    cartId: '22222222-2222-4222-8222-222222222222',
    customerId: 5,
    warehouseId: 'west',
    revision: '33333333-3333-4333-8333-333333333333',
    productId: 91,
    variantId: 92,
    quantity: 1,
    grandTotal: 50,
    currency: 'USD',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  };
  current = {
    id: policy.cartId,
    order_id: null,
    grand_total: 50,
    cart: {
      customer_id: 5,
      channel_id: 37,
      currency: { code: 'USD' },
      line_items: {
        physical_items: [{ id: 'item', product_id: 91, variant_id: 92, quantity: 1 }],
        digital_items: [],
        custom_items: [],
        gift_certificates: [],
      },
    },
    consignments: [
      { id: 'c', line_item_ids: ['item'], selected_pickup_option: { pickup_method_id: 83 } },
    ],
  };
  process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION = JSON.stringify(policy);
  process.env.WAREHOUSE_VALIDATION_SECRET = secret;
  process.env.WAREHOUSE_REDIS_NAMESPACE = 'synthetic-check-test';
  reads = 0;
  validations = 0;
  attempts = 0;
  mutate = undefined;
  validationError = undefined;
  redisError = undefined;
});

const input = () => ({
  token: 'synthetic-validation-capability',
  origin,
  cartId: policy.cartId,
  revision: policy.revision,
  warehouseId: policy.warehouseId,
});
const claim = () => ({
  ...input(),
  submission: submissionSnapshot(current),
  claim: {
    token: pure.checkTestAuthorization(policy, origin, secret).token,
    methodId: 'cheque',
    gatewayId: null,
  },
});

test('missing policy stays blocked with no API or Redis activity', async () => {
  delete process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION;
  assert.deepEqual(await authorizeCheckTest(input()), {});
  await assert.rejects(authorizeCheckTest(claim()), /unavailable/);
  assert.equal(reads + attempts, 0);
});
test('expired/malformed/overlong grants fail closed', () => {
  for (const value of [
    '{}',
    'invalid',
    JSON.stringify({ ...policy, expiresAt: 0 }),
    JSON.stringify({ ...policy, expiresAt: policy.expiresAt + 1000 }),
  ])
    assert.throws(() => pure.readCheckTestPolicy(value));
});
test('offer is read-only; one claim succeeds and reuse is rejected', async () => {
  const offer = await authorizeCheckTest(input());

  assert.equal(offer.checkTestAuthorization.methodId, 'cheque');
  assert.equal(attempts, 0);
  assert.equal((await authorizeCheckTest(claim())).checkTestClaimed, true);
  assert.equal(validations, 1);
  await assert.rejects(authorizeCheckTest(claim()), /already has an attempt/);
});
test('token is bound to scope, method, origin and configured policy', async () => {
  for (const change of [{ methodId: 'bigpaypay' }, { gatewayId: 'other' }, { token: 'forged' }])
    await assert.rejects(
      authorizeCheckTest({ ...claim(), claim: { ...claim().claim, ...change } }),
    );
  await assert.rejects(authorizeCheckTest({ ...claim(), origin: 'https://other.example' }));

  const old = claim();

  process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION = JSON.stringify({
    ...policy,
    id: '44444444-4444-4444-8444-444444444444',
  });
  await assert.rejects(authorizeCheckTest(old));
  assert.equal(attempts, 0);
});
test('wrong cart/revision/warehouse, customer, products, quantity, amount and currency cannot claim', async () => {
  for (const change of [
    { cartId: '55555555-5555-4555-8555-555555555555' },
    { revision: '55555555-5555-4555-8555-555555555555' },
    { warehouseId: 'east' },
  ])
    await assert.rejects(authorizeCheckTest({ ...claim(), ...change }));

  for (const edit of [
    (c) => (c.cart.customer_id = 6),
    (c) => (c.cart.channel_id = 99),
    (c) => (c.cart.currency.code = 'CAD'),
    (c) => (c.grand_total = 51),
    (c) => (c.order_id = 123),
    (c) => (c.cart.line_items.physical_items[0].product_id = 99),
    (c) => (c.cart.line_items.physical_items[0].quantity = 2),
    (c) => c.cart.line_items.digital_items.push({}),
  ]) {
    const before = structuredClone(current);

    edit(current);
    await assert.rejects(authorizeCheckTest(claim()));
    current = before;
  }

  assert.equal(attempts, 0);
});
test('strict snapshot, stock/revision revalidation and mid-validation changes precede claim', async () => {
  await assert.rejects(
    authorizeCheckTest({
      ...claim(),
      submission: { ...submissionSnapshot(current), grandTotal: 49 },
    }),
  );
  validationError = new Error('inventory conflict');
  await assert.rejects(authorizeCheckTest(claim()), /inventory/);
  validationError = undefined;
  mutate = () => (current.cart.customer_id = 6);
  await assert.rejects(authorizeCheckTest(claim()), /changed/);
  assert.equal(attempts, 0);
});
test('revocation while checking blocks before Redis', async () => {
  mutate = () => delete process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION;
  await assert.rejects(authorizeCheckTest(claim()));
  assert.equal(attempts, 0);
});
test('uncertain claim cannot be retried as a new successful execution', async () => {
  redisError = new Error('lost reply after commit');
  await assert.rejects(authorizeCheckTest(claim()), /uncertain/);
  redisError = undefined;
  await assert.rejects(authorizeCheckTest(claim()), /already has an attempt/);
});
test('real private Redis atomically admits one contender and never replays a claim', async () => {
  const binary = process.env.ATOMIC_TEST_REDIS_SERVER;
  const cli = process.env.ATOMIC_TEST_REDIS_CLI;

  assert.ok(binary && cli, 'Explicit local Redis binaries required');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-test-'));
  const socket = path.join(dir, 'redis.sock');
  const child = spawn(
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
      'no',
      '--maxmemory-policy',
      'noeviction',
    ],
    { stdio: 'ignore', env: { PATH: process.env.PATH } },
  );
  const client = redisClient(cli, socket);

  try {
    for (let n = 0; n < 100; n += 1) {
      try {
        if ((await client.command('PING')) === 'PONG') break;
      } catch {
        /* Wait for the private Unix socket. */
      }

      await delay(20);
    }

    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        pure.claimCheckTestAttempt(redisClient(cli, socket), 'isolated', policy, 'snapshot'),
      ),
    );

    assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
    await assert.rejects(
      pure.claimCheckTestAttempt(
        client,
        'isolated',
        { ...policy, id: '66666666-6666-4666-8666-666666666666' },
        'new-grant',
      ),
    );

    // Simulate a committed write whose HTTP response is lost, using another synthetic cart.
    const other = { ...policy, cartId: '77777777-7777-4777-8777-777777777777' };

    await assert.rejects(
      pure.claimCheckTestAttempt(
        {
          eval: async (...args) => {
            await client.eval(...args);
            throw new Error('lost');
          },
        },
        'isolated',
        other,
        'snapshot',
      ),
      /uncertain/,
    );
    await assert.rejects(
      pure.claimCheckTestAttempt(client, 'isolated', other, 'snapshot'),
      /already/,
    );
  } finally {
    const exit = once(child, 'exit');

    child.kill('SIGTERM');
    await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('normal Test-provider policy suppresses Check offers and claims even while disabled', async () => {
  for (const value of ['{"enabled":false}', '{}', 'invalid']) {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = value;
    assert.deepEqual(await authorizeCheckTest(input()), {});
    await assert.rejects(authorizeCheckTest(claim()));
  }

  assert.equal(attempts, 0);
});

test('enabling normal policy during a legacy Check claim revokes the legacy path', async () => {
  mutate = () => {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = '{"enabled":false}';
  };

  await assert.rejects(authorizeCheckTest(claim()));
  assert.equal(attempts, 0);
});
