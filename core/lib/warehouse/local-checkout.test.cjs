const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { beforeEach, test } = require('node:test');
const ts = require('typescript');

const file = path.join(__dirname, 'local-checkout.ts');
const compiled = new Module(file, module);
const loopbackSettings = {
  checkout_type: 'custom',
  custom_checkout_script_url: 'http://localhost:8080/auto-loader-dev.js',
};
const developmentManifest = {
  mode: 'development',
  stores: [
    {
      checkoutOrigin: 'https://checkout.invalid',
      validationEndpoint: 'http://localhost:3000/api/warehouse/validate',
      initializationEndpoint: 'http://localhost:3000/warehouse-initialize/',
    },
  ],
};

let mode;
let automatic;
let settings;
let storeSettings;
let manifest;
let reads;

beforeEach(() => {
  mode = 'development';
  automatic = false;
  settings = loopbackSettings;
  storeSettings = { checkout_type: 'optimized', custom_checkout_script_url: '' };
  manifest = developmentManifest;
  reads = [];
});

compiled.require = (id) => {
  if (id === 'zod') return require('zod');
  if (id === 'server-only') return {};
  if (id === './api')
    return {
      warehouseApi: async (resource) => {
        reads.push(resource);
        if (resource === 'checkouts/settings/channels/37') return settings;
        if (resource === 'checkouts/settings') return storeSettings;
        throw new Error('Unexpected API resource');
      },
    };
  if (id === './config')
    return {
      automaticInitializationEnabled: () => automatic,
      getWarehouseConfiguration: () => ({
        mode,
        channelId: 37,
        checkoutOrigins: ['https://checkout.invalid'],
      }),
    };
  if (id === './policy') return { WarehouseError: Error };
  throw new Error('Unexpected dependency');
};

// eslint-disable-next-line no-underscore-dangle -- Isolated module with explicit fixtures, no store requests.
compiled._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  file,
);
test('local redirect requires the activated local loader and correct non-purchasable manifest', async () => {
  const original = global.fetch;

  global.fetch = async (url) => {
    assert.equal(url, 'http://localhost:8080/warehouse-build.json');

    return { ok: true, json: async () => manifest };
  };

  try {
    await compiled.exports.assertWarehouseCheckoutReady(false);
    assert.deepEqual(reads, ['checkouts/settings/channels/37']);
    settings = { ...settings, checkout_type: 'optimized' };
    await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
    settings = { ...settings, checkout_type: 'custom' };
    manifest = { ...manifest, mode: 'off' };
    await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));

    global.fetch = async () => {
      throw new Error('offline');
    };

    await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
  } finally {
    global.fetch = original;
  }
});

test('development checks an inherited or partially overridden HTTPS loader at its own origin', async (t) => {
  const loader = 'https://checkout-tunnel.example/dev/auto-loader-dev.js';
  const previous = process.env.WAREHOUSE_DEV_CHECKOUT_LOADER_URL;

  process.env.WAREHOUSE_DEV_CHECKOUT_LOADER_URL = loader;
  t.after(() => {
    if (previous === undefined) delete process.env.WAREHOUSE_DEV_CHECKOUT_LOADER_URL;
    else process.env.WAREHOUSE_DEV_CHECKOUT_LOADER_URL = previous;
  });

  const fetchManifest = t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://checkout-tunnel.example/dev/warehouse-build.json');
    assert.equal(options.redirect, 'error');

    return { ok: true, json: async () => manifest };
  });

  const checkChannel = (type, url) => {
    settings = { checkout_type: type, custom_checkout_script_url: url };

    return compiled.exports.assertWarehouseCheckoutReady(false);
  };

  storeSettings = { checkout_type: 'custom', custom_checkout_script_url: loader };
  await checkChannel(null, null);
  await checkChannel('custom', null);
  storeSettings = {
    checkout_type: 'custom',
    custom_checkout_script_url: 'https://different.example/loader.js',
  };
  await checkChannel(null, loader);
  assert.equal(fetchManifest.mock.callCount(), 3);

  // An explicit channel choice takes precedence even when the store default would pass.
  storeSettings = { checkout_type: 'custom', custom_checkout_script_url: loader };
  await assert.rejects(checkChannel('optimized', null));
  await assert.rejects(checkChannel(null, ''));
  await assert.rejects(checkChannel('custom', 'https://different.example/dev/auto-loader-dev.js'));
  assert.equal(fetchManifest.mock.callCount(), 3);

  manifest = { ...developmentManifest, stores: [] };
  await assert.rejects(checkChannel(null, null), /development checkout build/);
});

test('staging shopper redirects require a configured custom checkout', async () => {
  mode = 'staging';
  settings = {
    checkout_type: 'custom',
    custom_checkout_script_url: 'https://assets.invalid/loader.js',
  };
  await compiled.exports.assertWarehouseCheckoutReady(false);
  settings = { ...settings, checkout_type: 'optimized' };
  await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
  await compiled.exports.assertWarehouseCheckoutReady(true);
  settings = { checkout_type: 'custom', custom_checkout_script_url: '' };
  await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
  settings = { checkout_type: null, custom_checkout_script_url: null };
  storeSettings = {
    checkout_type: 'custom',
    custom_checkout_script_url: 'https://assets.invalid/loader.js',
  };
  await compiled.exports.assertWarehouseCheckoutReady(false);
});

test('legacy preview requires its explicit rehearsal transport', async () => {
  mode = 'preview';
  await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
  await compiled.exports.assertWarehouseCheckoutReady(true);
});

test('one-click requires the local checkout build to use the same public app ID', async (t) => {
  automatic = true;

  const original = process.env;

  process.env = {
    ...original,
    TRAILING_SLASH: 'false',
    WAREHOUSE_CURRENT_CUSTOMER_CLIENT_ID: 'synthetic-app',
  };
  t.after(() => {
    process.env = original;
  });
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => manifest }));
  await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));

  const withApp = (currentCustomerClientId) => ({
    ...developmentManifest,
    stores: [
      {
        ...developmentManifest.stores[0],
        handoffEndpoint: 'http://localhost:3000/api/warehouse/initialize',
        currentCustomerClientId,
      },
    ],
  });

  manifest = withApp('other-app');
  await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
  manifest = withApp('synthetic-app');
  await compiled.exports.assertWarehouseCheckoutReady(false);
  process.env.TRAILING_SLASH = 'true';
  await assert.rejects(compiled.exports.assertWarehouseCheckoutReady(false));
  manifest.stores[0].handoffEndpoint += '/';
  await compiled.exports.assertWarehouseCheckoutReady(false);
});
