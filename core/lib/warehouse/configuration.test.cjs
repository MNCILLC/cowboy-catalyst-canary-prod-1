const assert = require('node:assert/strict');
const { test } = require('node:test');

const { hostedEnv: stage, loadTestModule, warehouse } = require('./mode-test-support.cjs');

const { readWarehouseConfiguration } = loadTestModule('configuration.ts', { zod: require('zod') });

test('missing and explicit off ignore the legacy flag and do not require warehouse configuration', () => {
  const off = { mode: 'off', warehouses: [], checkoutOrigins: [] };

  assert.deepEqual(readWarehouseConfiguration({}), off);
  ['production', 'development'].forEach((NODE_ENV) => {
    const env = { NODE_ENV, WAREHOUSE_PREVIEW_ENABLED: 'true', WAREHOUSE_CONFIG: 'invalid' };

    assert.deepEqual(readWarehouseConfiguration(env), off);
    assert.deepEqual(readWarehouseConfiguration({ ...env, WAREHOUSE_MODE: 'off' }), off);
  });
});

test('lightweight preview requires explicit opt-in and the development server', () => {
  assert.equal(
    readWarehouseConfiguration({
      NODE_ENV: 'development',
      WAREHOUSE_MODE: 'preview',
      WAREHOUSE_CONFIG: stage.WAREHOUSE_CONFIG,
    }).mode,
    'preview',
  );
});
test('production staging works for independent store configurations with no external dependencies', () => {
  const first = readWarehouseConfiguration(stage);
  const second = readWarehouseConfiguration({
    ...stage,
    BIGCOMMERCE_STORE_HASH: 'synthetic-b',
    BIGCOMMERCE_CHANNEL_ID: '82',
    WAREHOUSE_CONFIG: JSON.stringify([
      { ...warehouse, id: 'south', locationId: 800, pickupMethodId: 900, allowShipping: true },
    ]),
    WAREHOUSE_VALIDATION_BASE_URL: 'https://store-b.example',
    WAREHOUSE_CHECKOUT_ORIGINS: '["https://checkout-b.example"]',
  });

  assert.equal(first.mode, 'staging');
  assert.deepEqual(readWarehouseConfiguration({ ...stage, WAREHOUSE_MODE: 'staging' }), first);
  assert.equal(second.mode, 'staging');
  assert.equal(first.warehouses[0].pickupMethodId, 92);
  assert.equal(second.warehouses[0].pickupMethodId, 900);
  assert.notEqual(first.channelId, second.channelId);
});

const invalid = [
  { WAREHOUSE_MODE: 'production' },
  { WAREHOUSE_MODE: 'preview' },
  { WAREHOUSE_MODE: '' },
  { WAREHOUSE_CONFIG: '[]' },
  { WAREHOUSE_CONFIG: '{' },
  { WAREHOUSE_CONFIG: JSON.stringify([warehouse, warehouse]) },
  { WAREHOUSE_PERSISTENCE_PROVIDER: 'metafield' },
  { WAREHOUSE_REDIS_URL: 'http://redis.invalid' },
  { WAREHOUSE_REDIS_TOKEN: '' },
  { WAREHOUSE_REDIS_NAMESPACE: '' },
  { WAREHOUSE_VALIDATION_SECRET: '' },
  { WAREHOUSE_VALIDATION_BASE_URL: undefined },
  { WAREHOUSE_VALIDATION_BASE_URL: 'https://user:secret@example.com' },
  { WAREHOUSE_CHECKOUT_ORIGINS: '[]' },
  { WAREHOUSE_CHECKOUT_ORIGINS: '["http://checkout.example"]' },
  { BIGCOMMERCE_STORE_HASH: '' },
  { BIGCOMMERCE_CHANNEL_ID: 'bad' },
];

invalid.forEach((override, index) =>
  test(`invalid staging configuration ${index} fails without exposing credentials`, () => {
    assert.throws(() => readWarehouseConfiguration({ ...stage, ...override }), {
      message: 'Invalid warehouse configuration. Check the server staging configuration.',
    });
  }),
);

test('local development requires next dev and the exact loopback storefront origin', () => {
  const local = {
    ...stage,
    NODE_ENV: 'development',
    WAREHOUSE_MODE: 'development',
    WAREHOUSE_VALIDATION_BASE_URL: 'http://localhost:3000',
  };

  assert.equal(readWarehouseConfiguration(local).mode, 'development');
  assert.throws(() => readWarehouseConfiguration({ ...local, NODE_ENV: 'production' }));
  assert.throws(() =>
    readWarehouseConfiguration({
      ...local,
      WAREHOUSE_VALIDATION_BASE_URL: 'http://elsewhere.example',
    }),
  );
});
