const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const file = path.join(__dirname, 'configuration.ts');
const compiled = new Module(file, module);

compiled.filename = file;
compiled.paths = module.paths;

compiled.require = (id) => {
  if (id === 'zod') return require('zod');
  throw Error('Unexpected dependency');
};

// eslint-disable-next-line no-underscore-dangle -- Compile only the pure configuration module in memory.
compiled._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  file,
);

const { readWarehouseConfiguration } = compiled.exports;
const warehouse = {
  id: 'north',
  label: 'North',
  pickupLabel: 'Collect North',
  locationId: 71,
  pickupMethodId: 92,
  allowShipping: false,
};
const stage = {
  NODE_ENV: 'production',
  WAREHOUSE_MODE: 'staging',
  WAREHOUSE_CONFIG: JSON.stringify([warehouse]),
  WAREHOUSE_PERSISTENCE_PROVIDER: 'redis',
  WAREHOUSE_REDIS_URL: 'https://redis.invalid',
  WAREHOUSE_REDIS_TOKEN: 'synthetic-token',
  WAREHOUSE_REDIS_NAMESPACE: 'synthetic-staging',
  WAREHOUSE_VALIDATION_SECRET: 'synthetic-secret-at-least-32-characters',
  WAREHOUSE_VALIDATION_BASE_URL: 'https://store-a.example',
  WAREHOUSE_CHECKOUT_ORIGINS: '["https://checkout-a.example"]',
  BIGCOMMERCE_STORE_HASH: 'synthetic-a',
  BIGCOMMERCE_CHANNEL_ID: '37',
};

test('off is default, explicit off overrides preview, legacy preview stays development-only', () => {
  assert.equal(readWarehouseConfiguration({}).mode, 'off');
  assert.equal(
    readWarehouseConfiguration({ NODE_ENV: 'production', WAREHOUSE_PREVIEW_ENABLED: 'true' }).mode,
    'off',
  );
  assert.equal(
    readWarehouseConfiguration({ ...stage, WAREHOUSE_MODE: 'off', WAREHOUSE_CONFIG: 'invalid' })
      .mode,
    'off',
  );
  assert.equal(
    readWarehouseConfiguration({
      NODE_ENV: 'development',
      WAREHOUSE_PREVIEW_ENABLED: 'true',
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
  assert.equal(second.mode, 'staging');
  assert.equal(first.warehouses[0].pickupMethodId, 92);
  assert.equal(second.warehouses[0].pickupMethodId, 900);
  assert.notEqual(first.channelId, second.channelId);
});

const invalid = [
  { WAREHOUSE_MODE: 'production' },
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
