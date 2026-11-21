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

const origin = 'https://checkout.example';

let current;
let policy;
let reads;
let validations;
let attempts;
let mutate;
let validationError;
let redisError;
let providerMode;
let providerReads;
let deploymentMode;
let providerMutate;
let attemptClient;
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
          mode: deploymentMode,
          storeHash: '3olkgrdpfq',
          channelId: 1912525,
          checkoutOrigins: [origin],
          warehouses: [
            { id: 'powell', pickupMethodId: 83, allowShipping: false },
            { id: 'forney', pickupMethodId: 84, allowShipping: true },
          ],
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
          async eval(...args) {
            if (attemptClient) return attemptClient.eval(...args);
            attempts += 1;
            if (redisError) throw redisError;

            return attempts === 1 ? 1 : 0;
          }
        },
      };
    if (
      [
        './test-provider',
        './test-provider-normal',
        './test-provider-normal-server',
        './test-provider-method',
        './check-test',
        './authorization',
        './policy',
        './submission',
      ].includes(id)
    )
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

const pure = load('test-provider');
const { authorizeTestProvider } = load('test-provider-server');
const { submissionSnapshot } = load('submission');
const secret = 'synthetic-signing-secret-never-a-live-credential';

beforeEach(() => {
  delete process.env.WAREHOUSE_TEST_PROVIDER_POLICY;
  delete process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION;
  providerMutate = undefined;
  attemptClient = undefined;
  deploymentMode = 'staging';
  providerMode = 'test';
  providerReads = 0;
  process.env.BIGCOMMERCE_STORE_HASH = '3olkgrdpfq';
  process.env.BIGCOMMERCE_ACCESS_TOKEN = 'synthetic-not-a-real-token';

  global.fetch = async (url, options) => {
    providerReads += 1;
    if (providerMutate) providerMutate();
    assert.equal(url, 'https://api.bigcommerce.com/stores/3olkgrdpfq/v2/payments/methods');
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    if (providerMode === 'timeout') throw new Error('timeout');

    return {
      ok: providerMode !== 'error',
      json: async () => {
        if (providerMode === 'malformed') return {};
        if (providerMode === 'missing') return [];

        return [{ code: 'bigpaypay', test_mode: providerMode === 'test' }];
      },
    };
  };

  policy = {
    methodId: 'bigpaypay',
    testMode: true,
    id: '11111111-1111-4111-8111-111111111111',
    storeHash: '3olkgrdpfq',
    channelId: 1912525,
    cartId: '22222222-2222-4222-8222-222222222222',
    customerId: 5,
    warehouseId: 'powell',
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
      channel_id: 1912525,
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
  process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION = JSON.stringify(policy);
  process.env.WAREHOUSE_VALIDATION_SECRET = secret;
  process.env.WAREHOUSE_REDIS_NAMESPACE = 'synthetic-test-provider';
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
    token: pure.testProviderAuthorization(policy, origin, secret).token,
    methodId: 'bigpaypay',
    gatewayId: null,
    usesStoredInstrument: false,
    shouldSaveInstrument: false,
  },
});

test('missing policy stays blocked with no API or Redis activity', async () => {
  delete process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION;
  assert.deepEqual(await authorizeTestProvider(input()), {});
  await assert.rejects(authorizeTestProvider(claim()), /unavailable/);
  assert.equal(reads + attempts + providerReads, 0);
});
test('expired/malformed/overlong grants fail closed', () => {
  for (const value of [
    '{}',
    'invalid',
    JSON.stringify({ ...policy, expiresAt: 0 }),
    JSON.stringify({ ...policy, methodId: 'cheque' }),
    JSON.stringify({ ...policy, testMode: false }),
    JSON.stringify({ ...policy, expiresAt: policy.expiresAt + 1000 }),
  ])
    assert.throws(() => pure.readTestProviderPolicy(value));
});
test('offer is read-only; one claim succeeds and reuse is rejected', async () => {
  const offer = await authorizeTestProvider(input());

  assert.equal(offer.testProviderAuthorization.methodId, 'bigpaypay');
  assert.equal(attempts, 0);
  assert.equal((await authorizeTestProvider(claim())).testProviderClaimed, true);
  assert.equal(validations, 1);
  await assert.rejects(authorizeTestProvider(claim()), /already has an attempt/);
});
test('token is bound to scope, method, origin and configured policy', async () => {
  for (const change of [
    { methodId: 'cheque' },
    { methodId: 'bigcommerce_payments_creditcards' },
    { gatewayId: 'other' },
    { token: 'forged' },
    { usesStoredInstrument: true },
    { shouldSaveInstrument: true },
  ])
    await assert.rejects(
      authorizeTestProvider({ ...claim(), claim: { ...claim().claim, ...change } }),
    );
  await assert.rejects(authorizeTestProvider({ ...claim(), origin: 'https://other.example' }));

  const old = claim();

  process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION = JSON.stringify({
    ...policy,
    id: '44444444-4444-4444-8444-444444444444',
  });
  await assert.rejects(authorizeTestProvider(old));
  assert.equal(attempts, 0);
});
test('wrong cart/revision/warehouse, customer, products, quantity, amount and currency cannot claim', async () => {
  for (const change of [
    { cartId: '55555555-5555-4555-8555-555555555555' },
    { revision: '55555555-5555-4555-8555-555555555555' },
    { warehouseId: 'east' },
  ])
    await assert.rejects(authorizeTestProvider({ ...claim(), ...change }));

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
    await assert.rejects(authorizeTestProvider(claim()));
    current = before;
  }

  assert.equal(attempts, 0);
});
test('strict snapshot, stock/revision revalidation and mid-validation changes precede claim', async () => {
  await assert.rejects(
    authorizeTestProvider({
      ...claim(),
      submission: { ...submissionSnapshot(current), grandTotal: 49 },
    }),
  );
  validationError = new Error('inventory conflict');
  await assert.rejects(authorizeTestProvider(claim()), /inventory/);
  validationError = undefined;
  mutate = () => (current.cart.customer_id = 6);
  await assert.rejects(authorizeTestProvider(claim()), /changed/);
  assert.equal(attempts, 0);
});
test('revocation while checking blocks before Redis', async () => {
  mutate = () => delete process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION;
  await assert.rejects(authorizeTestProvider(claim()));
  assert.equal(attempts, 0);
});
test('uncertain claim cannot be retried as a new successful execution', async () => {
  redisError = new Error('lost reply after commit');
  await assert.rejects(authorizeTestProvider(claim()), /uncertain/);
  redisError = undefined;
  await assert.rejects(authorizeTestProvider(claim()), /already has an attempt/);
});
test('real private Redis atomically admits one contender and never replays a claim', async () => {
  const binary = process.env.ATOMIC_TEST_REDIS_SERVER;
  const cli = process.env.ATOMIC_TEST_REDIS_CLI;

  assert.ok(binary && cli, 'Explicit local Redis binaries required');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-provider-'));
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
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? load('check-test').claimCheckTestAttempt : pure.claimTestProviderAttempt)(
          redisClient(cli, socket),
          'isolated',
          policy,
          'snapshot',
        ),
      ),
    );

    assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
    await assert.rejects(
      pure.claimTestProviderAttempt(
        client,
        'isolated',
        { ...policy, id: '66666666-6666-4666-8666-666666666666' },
        'new-grant',
      ),
    );

    setupNormal();

    const normalClaim = await normalClaimInput();

    attemptClient = redisClient(cli, socket);

    const normalOutcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () => authorizeTestProvider(normalClaim)),
    );

    assert.equal(normalOutcomes.filter((x) => x.status === 'fulfilled').length, 1);
    await assert.rejects(authorizeTestProvider(normalClaim), /already/);
    await assert.rejects(
      pure.claimTestProviderAttempt(
        client,
        process.env.WAREHOUSE_REDIS_NAMESPACE,
        policy,
        'legacy-method',
      ),
      /already/,
    );
    attemptClient = undefined;

    // Simulate a committed write whose HTTP response is lost, using another synthetic cart.
    const other = { ...policy, cartId: '77777777-7777-4777-8777-777777777777' };

    await assert.rejects(
      pure.claimTestProviderAttempt(
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
      pure.claimTestProviderAttempt(client, 'isolated', other, 'snapshot'),
      /already/,
    );
  } finally {
    const exit = once(child, 'exit');

    child.kill('SIGTERM');
    await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('provider must be present and verified in test mode, including at claim time', async () => {
  for (const mode of ['live', 'missing', 'malformed', 'timeout', 'error']) {
    providerMode = mode;
    await assert.rejects(authorizeTestProvider(input()), /test mode/);
    await assert.rejects(authorizeTestProvider(claim()), /test mode/);
  }

  providerMode = 'test';

  mutate = () => {
    providerMode = 'live';
  };

  await assert.rejects(authorizeTestProvider(claim()), /test mode/);
  assert.equal(attempts, 0);
});
test('deployment, store, variant, extra items and policy changes fail closed', async () => {
  deploymentMode = 'development';
  await assert.rejects(authorizeTestProvider(claim()));
  delete process.env.WAREHOUSE_TEST_PROVIDER_POLICY;
  deploymentMode = 'staging';

  for (const change of [{ storeHash: 'other' }, { channelId: 99 }]) {
    process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION = JSON.stringify({ ...policy, ...change });
    await assert.rejects(authorizeTestProvider(claim()));
  }

  process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION = JSON.stringify(policy);

  for (const edit of [
    (c) => (c.cart.line_items.physical_items[0].variant_id = 100),
    (c) => c.cart.line_items.physical_items.push({ ...c.cart.line_items.physical_items[0] }),
    (c) => c.cart.line_items.custom_items.push({}),
    (c) => c.cart.line_items.gift_certificates.push({}),
  ]) {
    const before = structuredClone(current);

    edit(current);
    await assert.rejects(authorizeTestProvider(claim()));
    current = before;
  }

  const offer = await authorizeTestProvider(input());

  assert.equal(offer.testProviderAuthorization.testMode, true);

  const original = global.fetch;

  global.fetch = async (...args) => {
    const response = await original(...args);

    if (providerReads > 1) delete process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION;

    return response;
  };

  await assert.rejects(authorizeTestProvider(claim()));
  assert.equal(attempts, 0);
});

const normal = load('test-provider-normal');

function setupNormal(overrides = {}) {
  delete process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION;

  const configured = {
    enabled: true,
    version: 1,
    id: policy.id,
    methodId: 'bigpaypay',
    testMode: true,
    storeHash: '3olkgrdpfq',
    channelId: 1912525,
    origins: [origin],
    warehouseIds: ['powell', 'forney'],
    currencies: ['USD'],
    grantTtlSeconds: 300,
    maxLineItems: 10,
    maxQuantity: 50,
    maxGrandTotal: 1000,
    ...overrides,
  };

  process.env.WAREHOUSE_TEST_PROVIDER_POLICY = JSON.stringify(configured);
  current.cart.line_items.physical_items = [
    { id: 'item', product_id: 91, variant_id: 92, quantity: 2 },
    { id: 'item-2', product_id: 93, variant_id: 94, quantity: 3 },
  ];
  current.consignments[0].line_item_ids = ['item', 'item-2'];

  return configured;
}

async function normalClaimInput(overrides = {}) {
  const request = { ...input(), ...overrides };
  const offer = await authorizeTestProvider(request);

  return {
    ...request,
    submission: submissionSnapshot(current),
    claim: {
      token: offer.testProviderAuthorization.token,
      methodId: 'bigpaypay',
      gatewayId: null,
      usesStoredInstrument: false,
      shouldSaveInstrument: false,
    },
  };
}

test('normal policy defaults off and explicit disable prevents legacy fallback', async () => {
  delete process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION;
  assert.deepEqual(await authorizeTestProvider(input()), {});

  for (const encoded of ['', '{"enabled":false}']) {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = encoded;
    assert.deepEqual(await authorizeTestProvider(input()), {});
    await assert.rejects(authorizeTestProvider(claim()));
  }

  assert.equal(reads + providerReads + attempts, 0);
});

test('normal policy rejects malformed, live-provider, excessive TTL and ambiguous policies', async () => {
  for (const changes of [
    { methodId: 'cheque' },
    { testMode: false },
    { grantTtlSeconds: 901 },
    { origins: ['http://localhost:3000'] },
    { maxLineItems: 101 },
    { maxQuantity: 0 },
    { maxGrandTotal: 0 },
  ]) {
    setupNormal(changes);
    await assert.rejects(authorizeTestProvider(input()));
  }

  for (const encoded of ['invalid', '{}', '{"enabled":false,"extra":true}']) {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = encoded;
    await assert.rejects(authorizeTestProvider(input()));
  }

  for (const key of [
    'WAREHOUSE_TEST_PROVIDER_AUTHORIZATION',
    'WAREHOUSE_CHECK_TEST_AUTHORIZATION',
  ]) {
    setupNormal();
    process.env[key] = JSON.stringify(policy);
    await assert.rejects(authorizeTestProvider(input()));
    delete process.env[key];
  }

  assert.equal(reads + attempts, 0);
});

test('normal multi-item pickup grant is read-only and permits exactly one simulated claim', async () => {
  setupNormal();

  const request = await normalClaimInput();

  assert.ok(request.claim.token.length < 4096);
  assert.equal(attempts, 0);
  assert.equal((await authorizeTestProvider(request)).testProviderClaimed, true);
  await assert.rejects(authorizeTestProvider(request), /already/);
});

test('Forney shipping and pickup qualify; Powell shipping does not', async () => {
  setupNormal();
  current.consignments[0] = {
    id: 'freight',
    line_item_ids: ['item', 'item-2'],
    selected_shipping_option: { id: 'freight-quote', type: 'shipping_byweight' },
  };
  assert.deepEqual(await authorizeTestProvider(input()), {});
  assert.ok(
    (await authorizeTestProvider({ ...input(), warehouseId: 'forney' })).testProviderAuthorization,
  );
  current.consignments[0] = {
    id: 'pickup',
    line_item_ids: ['item', 'item-2'],
    selected_pickup_option: { pickup_method_id: 84 },
  };
  assert.ok(
    (await authorizeTestProvider({ ...input(), warehouseId: 'forney' })).testProviderAuthorization,
  );
  assert.equal(attempts, 0);
});

test('authenticated guest cart can qualify but its grant cannot move to another customer', async () => {
  setupNormal();
  current.cart.customer_id = 0;

  const request = await normalClaimInput();

  current.cart.customer_id = 5;
  await assert.rejects(authorizeTestProvider(request));
  assert.equal(attempts, 0);
});

test('normal grant binds customer, items, quantities, totals, currency and fulfillment', async () => {
  setupNormal({ currencies: ['USD', 'CAD'] });

  const request = await normalClaimInput();

  for (const edit of [
    (c) => (c.cart.customer_id += 1),
    (c) => (c.cart.line_items.physical_items[0].quantity += 1),
    (c) => (c.cart.line_items.physical_items[0].product_id += 1),
    (c) => (c.cart.line_items.physical_items[0].variant_id += 1),
    (c) => (c.grand_total += 1),
    (c) => {
      c.cart.currency.code = 'CAD';
    },
    (c) => {
      c.consignments[0].id = 'changed';
    },
  ]) {
    const baseline = structuredClone(current);

    edit(current);
    await assert.rejects(
      authorizeTestProvider({ ...request, submission: submissionSnapshot(current) }),
    );
    current = baseline;
  }

  assert.equal(attempts, 0);
});

test('normal scope, method, wallet, stored instrument and forged token cannot bypass grant', async () => {
  setupNormal();

  const request = await normalClaimInput();

  for (const change of [
    { origin: 'https://other.example' },
    { warehouseId: 'forney' },
    { revision: '55555555-5555-4555-8555-555555555555' },
    { cartId: '55555555-5555-4555-8555-555555555555' },
  ]) {
    await assert.rejects(authorizeTestProvider({ ...request, ...change }));
  }

  for (const change of [
    { methodId: 'cheque' },
    { methodId: 'paypal' },
    { gatewayId: 'wallet' },
    { usesStoredInstrument: true },
    { shouldSaveInstrument: true },
    { token: 'forged' },
    { token: `${request.claim.token}x` },
  ]) {
    await assert.rejects(
      authorizeTestProvider({ ...request, claim: { ...request.claim, ...change } }),
    );
  }

  await assert.rejects(authorizeTestProvider({ ...request, submission: undefined }));
  assert.equal(attempts, 0);
});

test('normal limits, invalid items, nonphysical items, incomplete fulfillment and existing orders fail closed', async () => {
  setupNormal();

  for (const edit of [
    (c) => {
      c.order_id = 123;
    },
    (c) => {
      c.cart.channel_id = 99;
    },
    (c) => {
      c.grand_total = 1001;
    },
    (c) => {
      c.grand_total = 0;
    },
    (c) => {
      c.cart.line_items.physical_items[0].quantity = 51;
    },
    (c) => {
      c.cart.line_items.physical_items[0].quantity = 0.5;
    },
    (c) => {
      c.cart.line_items.physical_items = [];
    },
    (c) => c.cart.line_items.digital_items.push({}),
    (c) => c.cart.line_items.custom_items.push({}),
    (c) => c.cart.line_items.gift_certificates.push({}),
    (c) => {
      c.consignments = [];
    },
    (c) => {
      c.consignments[0].line_item_ids = ['item'];
    },
  ]) {
    const baseline = structuredClone(current);

    edit(current);
    assert.deepEqual(await authorizeTestProvider(input()), {});
    current = baseline;
  }

  assert.equal(attempts, 0);
});

test('removing the extra pickup line restores a normal offer at the configured limit', async () => {
  setupNormal({ maxLineItems: 1 });
  const second = current.cart.line_items.physical_items.pop();
  current.consignments[0].line_item_ids.pop();

  // Two units of one line remain eligible.
  assert.ok((await authorizeTestProvider(input())).testProviderAuthorization);

  current.cart.line_items.physical_items.push(second);
  current.consignments[0].line_item_ids.push(second.id);
  assert.deepEqual(await authorizeTestProvider(input()), {
    testProviderIneligibility: { code: 'MAX_LINE_ITEMS_EXCEEDED', maxLineItems: 1 },
  });

  current.cart.line_items.physical_items.pop();
  current.consignments[0].line_item_ids.pop();
  const restored = await authorizeTestProvider(input());

  assert.ok(restored.testProviderAuthorization);
  assert.equal(restored.testProviderIneligibility, undefined);
  assert.equal(attempts, 0);
});

test('normal grant expiry and policy generation/scope changes revoke outstanding grants', async () => {
  const configured = setupNormal();
  const request = await normalClaimInput();
  const data = JSON.parse(Buffer.from(request.claim.token.split('.')[0], 'base64url'));

  assert.throws(() =>
    normal.verifyNormalTestProviderClaim(
      configured,
      data.binding,
      secret,
      request.claim,
      data.expiresAt * 1000,
    ),
  );

  for (const changes of [
    { id: '44444444-4444-4444-8444-444444444444' },
    { maxQuantity: 49 },
    { storeHash: 'wrong-fixture-store' },
    { channelId: 99 },
    { enabled: false },
  ]) {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = JSON.stringify({ ...configured, ...changes });
    await assert.rejects(authorizeTestProvider(request));
  }

  delete process.env.WAREHOUSE_TEST_PROVIDER_POLICY;
  await assert.rejects(authorizeTestProvider(request));
  assert.equal(attempts, 0);
});

test('normal mid-validation stock, stale revision, checkout and policy failures cannot consume an attempt', async () => {
  setupNormal();

  const request = await normalClaimInput();

  for (const message of ['inventory conflict', 'stale revision', 'recovery unavailable']) {
    validationError = new Error(message);
    await assert.rejects(authorizeTestProvider(request));
  }

  validationError = undefined;

  mutate = () => {
    current.grand_total += 1;
  };

  await assert.rejects(authorizeTestProvider(request), /changed/);
  current.grand_total -= 1;

  mutate = () => {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = '{"enabled":false}';
  };

  await assert.rejects(authorizeTestProvider(request));
  assert.equal(attempts, 0);
});

test('normal provider live, missing, malformed, unavailable and late revocation fail closed', async () => {
  setupNormal();

  const request = await normalClaimInput();

  for (const mode of ['live', 'missing', 'malformed', 'timeout', 'error']) {
    providerMode = mode;
    await assert.rejects(authorizeTestProvider(request));
  }

  providerMode = 'test';

  providerMutate = () => {
    delete process.env.WAREHOUSE_TEST_PROVIDER_POLICY;
  };

  await assert.rejects(authorizeTestProvider(request));
  assert.equal(attempts, 0);
});

test('normal lost claim response remains blocked on retry and policy rotation', async () => {
  setupNormal();

  const request = await normalClaimInput();

  redisError = new Error('lost response');
  await assert.rejects(authorizeTestProvider(request), /uncertain/);
  redisError = undefined;
  await assert.rejects(authorizeTestProvider(request), /already/);
  setupNormal({ id: '44444444-4444-4444-8444-444444444444' });
  await assert.rejects(authorizeTestProvider(await normalClaimInput()), /already/);
});

test('enabling normal policy during a legacy Test-provider claim revokes the legacy path', async () => {
  mutate = () => {
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY = '{"enabled":false}';
  };

  await assert.rejects(authorizeTestProvider(claim()));
  assert.equal(attempts, 0);
});

test('normal grant expiring during provider lookup cannot consume a claim', async () => {
  setupNormal();

  const request = await normalClaimInput();
  const originalNow = Date.now;
  const expiredNow = originalNow() + 301000;

  providerMutate = () => {
    Date.now = () => expiredNow;
  };

  try {
    await assert.rejects(authorizeTestProvider(request));
    assert.equal(attempts, 0);
  } finally {
    Date.now = originalNow;
  }
});

test('100-line normal carts keep grants within the existing standalone transport contract', async () => {
  setupNormal({ maxLineItems: 100, maxQuantity: 100 });
  current.cart.line_items.physical_items = Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i}`,
    product_id: i + 1,
    variant_id: 0,
    quantity: 1,
  }));
  current.consignments[0].line_item_ids = current.cart.line_items.physical_items.map(
    (item) => item.id,
  );

  const request = await normalClaimInput();

  assert.ok(request.claim.token.length < 4096);
  assert.equal(attempts, 0);
});
