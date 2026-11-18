const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const file = path.join(__dirname, 'local-checkout.ts');
const compiled = new Module(file, module);
let settings = {
  checkout_type: 'custom',
  custom_checkout_script_url: 'http://localhost:8080/auto-loader-dev.js',
};
let manifest = {
  mode: 'development',
  stores: [
    {
      checkoutOrigin: 'https://checkout.invalid',
      validationEndpoint: 'http://localhost:3000/api/warehouse/validate',
      initializationEndpoint: 'http://localhost:3000/warehouse-initialize/',
    },
  ],
};

compiled.require = (id) => {
  if (id === 'zod') return require('zod');
  if (id === 'server-only') return {};
  if (id === './api') return { warehouseApi: async () => settings };
  if (id === './config')
    return {
      getWarehouseConfiguration: () => ({
        mode: 'development',
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
    await compiled.exports.assertLocalCheckoutReady();
    settings = { ...settings, checkout_type: 'optimized' };
    await assert.rejects(compiled.exports.assertLocalCheckoutReady());
    settings = { ...settings, checkout_type: 'custom' };
    manifest = { ...manifest, mode: 'off' };
    await assert.rejects(compiled.exports.assertLocalCheckoutReady());

    global.fetch = async () => {
      throw new Error('offline');
    };

    await assert.rejects(compiled.exports.assertLocalCheckoutReady());
  } finally {
    global.fetch = original;
  }
});
