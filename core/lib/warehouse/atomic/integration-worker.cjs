const { NextRequest } = require('next/server');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const { redisClient } = require('./test-support.cjs');

// Synthetic environment only: the parent passes no store credentials or env files.
process.env.NODE_ENV = 'development';
process.env.WAREHOUSE_MODE = 'preview';
process.env.WAREHOUSE_PERSISTENCE_PROVIDER = 'redis';
process.env.BIGCOMMERCE_STORE_HASH = 'synthetic-store';
process.env.WAREHOUSE_REDIS_URL = 'https://redis.invalid';
process.env.WAREHOUSE_REDIS_TOKEN = 'synthetic-token';
process.env.WAREHOUSE_REDIS_NAMESPACE = 'synthetic-integration';
process.env.WAREHOUSE_VALIDATION_SECRET = 'synthetic-test-secret-at-least-32-characters';

const warehouses = [
  {
    id: 'forney',
    label: 'Ship/Pickup Forney',
    pickupLabel: 'Forney',
    locationId: 1,
    pickupMethodId: 201,
    allowShipping: true,
  },
  {
    id: 'powell',
    label: 'Pickup Powell',
    pickupLabel: 'Powell',
    locationId: 102,
    pickupMethodId: 202,
    allowShipping: false,
  },
];

process.env.WAREHOUSE_CONFIG = JSON.stringify(warehouses);

const client = redisClient(process.env.ATOMIC_TEST_REDIS_CLI, process.env.ATOMIC_TEST_SOCKET);
const stats = {
  externalRequests: 0,
  forbiddenCalls: 0,
  apiReads: 0,
  consignmentDeletes: 0,
  consignmentCreates: 0,
  metafieldCalls: 0,
};

global.fetch = () => {
  stats.externalRequests += 1;
  throw new Error('External HTTP prohibited');
};

let state = {};
let barrier;
let running;
let entered;
let unblock;
const root = path.resolve(__dirname, '../../..');
const modules = new Map();

async function inventoryAt(locationId, productId) {
  if (barrier === 'stock') {
    barrier = undefined;
    entered();
    await new Promise((resolve) => {
      unblock = resolve;
    });
  }

  return [
    {
      identity: { product_id: Number(productId), variant_id: null },
      available_to_sell: state.locationStock?.[locationId]?.[productId] ?? state.stock ?? 10,
    },
  ];
}

function fixtureCart(endpoint) {
  const found = [state.cart, ...(state.otherCarts ?? [])].find(
    (cart) => endpoint === `carts/${cart.id}`,
  );

  if (found) return structuredClone(found);

  const { WarehouseValidationError } = load('lib/warehouse/authorization.ts');

  throw new WarehouseValidationError('Cart expired', 404, 'CART_NOT_FOUND');
}

async function api(endpoint, method = 'GET', body = undefined) {
  if (endpoint.includes('metafields')) {
    stats.metafieldCalls += 1;
    if ((process.env.WAREHOUSE_PERSISTENCE_PROVIDER ?? 'metafield') !== 'metafield')
      throw new Error('Redis must never access metafields');
    if (method === 'GET') return state.metafields ?? [];

    if (endpoint === 'carts/metafields' && ['POST', 'PUT'].includes(method)) {
      state.metafields = body.map((f) => ({ ...f, id: 1 }));

      return [];
    }
  }

  if (method === 'GET') {
    stats.apiReads += 1;
    if (endpoint === 'inventory/locations?location_id:in=1,102&limit=2')
      return [
        { id: 1, enabled: state.forneyEnabled !== false },
        { id: 102, enabled: state.powellEnabled !== false },
      ];
    if (/^carts\/[\da-f-]{36}$/.test(endpoint)) return fixtureCart(endpoint);
    if (endpoint === `checkouts/${state.cart.id}`) return structuredClone(state.checkout);

    const product = /^catalog\/products\/(9001|9002)\?include=variants$/.exec(endpoint);

    if (product)
      return {
        id: Number(product[1]),
        name: product[1] === '9001' ? 'Synthetic product' : 'Second synthetic product',
        type: 'physical',
        inventory_tracking: 'product',
        variants: [],
      };

    const inventory =
      /^inventory\/locations\/(1|102)\/items\?product_id:in=(9001|9002)&limit=250&page=1$/.exec(
        endpoint,
      );

    if (inventory) return inventoryAt(inventory[1], inventory[2]);
  }

  if (
    method === 'DELETE' &&
    state.checkout.consignments.some(
      (c) => endpoint === `checkouts/${state.cart.id}/consignments/${c.id}`,
    )
  ) {
    stats.consignmentDeletes += 1;
    state.checkout.consignments = state.checkout.consignments.filter(
      (c) => !endpoint.endsWith(`/${c.id}`),
    );

    return undefined;
  }

  if (method === 'POST' && endpoint === `checkouts/${state.cart.id}/consignments`) {
    stats.consignmentCreates += 1;
    state.checkout.consignments = body.map((entry) => ({
      id: 'synthetic-native-pickup',
      line_item_ids: entry.line_items.map((item) => item.item_id),
      selected_pickup_option: entry.pickup_option,
    }));

    return structuredClone(state.checkout);
  }

  stats.forbiddenCalls += 1;
  throw new Error(`Unexpected fake API call: ${method} ${endpoint}`);
}

const files = [
  'lib/map-section/address.ts',
  'lib/warehouse/server.ts',
  'lib/warehouse/shopper-carts.ts',
  'lib/warehouse/pickup-handoff.ts',
  'lib/warehouse/config.ts',
  'lib/warehouse/configuration.ts',
  'lib/warehouse/locations.ts',
  'lib/warehouse/policy.ts',
  'lib/warehouse/authorization.ts',
  'lib/warehouse/persistence.ts',
  'lib/warehouse/metafield-persistence.ts',
  'lib/warehouse/validation.ts',
  'lib/warehouse/submission.ts',
  'lib/warehouse/atomic/persistence.ts',
  'lib/warehouse/atomic/redis-scripts.ts',
  'components/warehouse-picker/actions.ts',
  'components/warehouse-picker/selection-attempt.ts',
  'app/api/warehouse/validate/route.ts',
];

const shopperSession = {
  '~/client/queries/get-customer': { getSignedInWarehouseCustomerId: async () => state.customerId },
  '~/lib/cart': {
    getCartId: async () => state.sessionCartId,
    setCartId: async (cartId) => {
      state.sessionCartId = cartId;
    },
    clearCartId: async () => {
      state.sessionCartId = undefined;
    },
  },
};

function load(relative) {
  const file = path.resolve(root, relative);

  if (!files.some((allowed) => file === path.join(root, allowed)))
    throw new Error(`Forbidden module: ${relative}`);
  if (modules.has(file)) return modules.get(file).exports;

  const compiled = new Module(file, module);

  modules.set(file, compiled);
  compiled.filename = file;
  compiled.paths = module.paths;

  compiled.require = (id) => {
    if (id === 'server-only') return {};
    if (id === 'react') return require('react');
    if (id === 'next/navigation') return { unstable_rethrow() {} };
    if (id === 'node:crypto') return require('node:crypto');
    if (id === 'node:util') return require('node:util');
    if (id === 'zod') return require('zod');
    if (id === 'next/server') return require('next/server');
    if (id === 'next/headers')
      return {
        cookies: async () => ({
          get: () => ({ value: state.cookie }),
          set: (_key, value) => {
            state.cookie = value;
          },
        }),
      };
    if (id === 'next-intl/server') return { getLocale: async () => 'en' };
    if (id === '~/channels.config') return { getChannelIdFromLocale: () => 37 };
    if (Object.hasOwn(shopperSession, id)) return shopperSession[id];
    // These synthetic carts have no previous submission or enabled payment provider.
    if (id === '~/lib/warehouse/recovery') return { readSubmissionRecovery: async () => false };
    if (id === '~/lib/warehouse/check-test-server') return { authorizeCheckTest: async () => ({}) };
    if (id === '~/lib/warehouse/test-provider-server')
      return { authorizeTestProvider: async () => ({}) };
    if (id === 'next/cache')
      return {
        revalidatePath: () => {
          if (state.revalidateFailure) throw new Error('Synthetic response lost');
        },
      };
    if (id === './api') return { warehouseApi: api };
    if (id === './atomic/upstash')
      return {
        createUpstashWarehousePersistence: (config) => {
          if (!config.url || !config.token || !config.namespace)
            throw new Error('Missing test config');

          const { AtomicWarehousePersistence } = load('lib/warehouse/atomic/persistence.ts');

          return new AtomicWarehousePersistence(
            {
              eval: async (script, keys, args) => {
                if (state.outage) throw new Error('Synthetic Redis outage');

                const writes = script.includes("redis.call('HSET'");

                if (writes && barrier === 'cas') {
                  barrier = undefined;
                  entered();
                  await new Promise((resolve) => {
                    unblock = resolve;
                  });
                }

                const result = await client.eval(script, keys, args);

                if (barrier === 'read' && script.includes("return {'ok', current}")) {
                  barrier = undefined;
                  entered();
                  await new Promise((resolve) => {
                    unblock = resolve;
                  });
                }

                if (writes && state.loseCommitResponse) {
                  state.loseCommitResponse = false;
                  throw new Error('Synthetic response lost after commit');
                }

                return result;
              },
            },
            { namespace: config.namespace },
          );
        },
      };
    if (id.startsWith('~/')) return load(`${id.slice(2)}.ts`);
    if (id.startsWith('.'))
      return load(path.relative(root, path.resolve(path.dirname(file), `${id}.ts`)));
    throw new Error(`Forbidden dependency: ${id}`);
  };

  // eslint-disable-next-line no-underscore-dangle -- Compile only allowlisted application modules in memory.
  compiled._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

  return compiled.exports;
}

const server = load('lib/warehouse/server.ts');
const action = load('components/warehouse-picker/actions.ts');
const validation = load('lib/warehouse/validation.ts');
const route = load('app/api/warehouse/validate/route.ts');
const submission = load('lib/warehouse/submission.ts');
const persistence = load('lib/warehouse/persistence.ts');
const { getWarehouseConfiguration } = load('lib/warehouse/config.ts');

async function validate(payload) {
  const req = new NextRequest('http://localhost/api/warehouse/validate', {
    method: 'POST',
    headers: {
      origin:
        payload.origin ??
        (getWarehouseConfiguration().mode === 'staging'
          ? 'https://checkout.invalid'
          : 'http://localhost:4010'),
      authorization: `Bearer ${payload.access.token}`,
    },
    body: JSON.stringify({
      cartId: state.cart.id,
      revision: payload.access.revision,
      ...(payload.mode ? { requestedMode: payload.mode } : {}),
      ...(payload.submit ? { submission: submission.submissionSnapshot(state.checkout) } : {}),
    }),
  });
  const response = await route.POST(req);

  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get('cache-control'),
  };
}

// eslint-disable-next-line complexity -- Explicit isolated IPC commands keep the test dependency boundary auditable.
async function dispatch(command, payload = {}) {
  switch (command) {
    case 'setup': {
      state = { cookie: 'forney', stock: 10, ...payload };
      state.cart = {
        id: payload.cartId,
        channel_id: payload.channelId ?? 37,
        line_items: {
          physical_items: [
            {
              id: 'line-1',
              product_id: 9001,
              variant_id: 0,
              quantity: 1,
              name: 'Synthetic product',
            },
          ],
          digital_items: [],
        },
      };
      state.sessionCartId = payload.cartId;
      state.checkout = {
        id: payload.cartId,
        order_id: null,
        grand_total: 50,
        cart: state.cart,
        consignments: [],
      };

      return { pid: process.pid };
    }

    case 'patch':
      Object.assign(state, payload);

      return null;

    case 'env':
      Object.entries(payload).forEach(([key, value]) => {
        if (value === null) delete process.env[key];
        else process.env[key] = value;
      });

      return null;

    case 'reserveFirstAdd':
      state.firstAdd = await server.reserveNewCartWarehouse('powell');

      return Boolean(state.firstAdd);

    case 'completeFirstAdd':
      await state.firstAdd.complete(state.cart.id);

      return null;

    case 'initialize':
      await server.persistNewCartWarehouse(state.cart.id, payload.warehouseId ?? 'forney');

      return persistence.readWarehouseRecord(state.cart.id, 37);

    case 'context':
      return server.getWarehouseContext();

    case 'select':
      return action.changeWarehouse(payload.warehouseId, payload.expected);

    case 'items':
      return server.assertWarehouseItems(
        [{ productEntityId: 9001, quantity: 1 }],
        payload.newCart ? undefined : state.cart.id,
      );

    case 'authorize':
      return server.authorizeWarehouseInitialization(state.cart.id);

    case 'handoff': {
      const result = await server.prepareWarehousePreview(state.cart.id);

      return {
        ...result,
        access: validation.createValidationAccess(
          result.record,
          getWarehouseConfiguration().mode === 'staging'
            ? 'https://checkout.invalid'
            : 'http://localhost:4010',
          'http://localhost:3011',
        ),
      };
    }

    case 'fulfillment': {
      state.checkout.consignments = [
        {
          id: 'consignment-1',
          line_item_ids: ['line-1'],
          ...(payload.mode === 'shipping'
            ? { selected_shipping_option: { id: 'freight', type: 'custom' } }
            : {
                selected_pickup_option: {
                  pickup_method_id: payload.warehouseId === 'powell' ? 202 : 201,
                },
              }),
        },
      ];

      return null;
    }

    case 'validate':
      return validate(payload);

    case 'arm': {
      barrier = payload.boundary;

      const reached = new Promise((resolve) => {
        entered = resolve;
      });

      if (payload.operation === 'items')
        running = server.assertWarehouseItems(
          [{ productEntityId: 9001, quantity: 1 }],
          state.cart.id,
        );
      else if (payload.operation === 'authorize')
        running = server.authorizeWarehouseInitialization(state.cart.id);
      else if (payload.boundary === 'cas' || payload.operation === 'select')
        running = action.changeWarehouse(payload.warehouseId, payload.expected);
      else if (payload.boundary === 'read') running = server.prepareWarehousePreview(state.cart.id);
      else running = validate(payload);
      await reached;

      return { pid: process.pid };
    }

    case 'release':
      unblock();

      return running;

    case 'stats':
      return { ...stats, cookie: state.cookie };

    case 'clientRetry': {
      const { createSelectionAttempt, runSelectionAttempt } = load(
        'components/warehouse-picker/selection-attempt.ts',
      );
      const context = { cartId: state.cart.id, revision: payload.revision };
      const attempt = createSelectionAttempt('powell', context);
      const calls = [];
      const failed = await runSelectionAttempt(attempt, async (...args) => {
        calls.push(args);
        throw new Error('Lost response');
      });

      context.revision = 'new-props';

      const retried = await runSelectionAttempt(failed.retry, async (...args) => {
        calls.push(args);

        return {};
      });
      const conflict = await runSelectionAttempt(attempt, async () => ({
        error: 'stale',
        retryable: false,
      }));
      const unavailable = await runSelectionAttempt(attempt, async () => ({
        error: 'unavailable',
        retryable: true,
      }));

      return {
        attempt,
        calls,
        retried,
        conflict,
        unavailable,
        next: createSelectionAttempt('forney', context),
      };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

process.on('message', async ({ id, action: command, payload }) => {
  try {
    process.send({ id, ok: true, result: await dispatch(command, payload) });
  } catch (error) {
    process.send({
      id,
      ok: false,
      error: { message: error.message, code: error.code, status: error.status },
    });
  }
});
process.send({ ready: true, pid: process.pid });
