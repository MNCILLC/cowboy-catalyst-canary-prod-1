const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const warehouse = {
  id: 'north',
  label: 'North',
  pickupLabel: 'Collect North',
  locationId: 71,
  pickupMethodId: 92,
  allowShipping: false,
};

const hostedEnv = {
  NODE_ENV: 'production',
  WAREHOUSE_MODE: 'multi-location',
  WAREHOUSE_CONFIG: JSON.stringify([warehouse]),
  WAREHOUSE_PERSISTENCE_PROVIDER: 'redis',
  WAREHOUSE_REDIS_URL: 'https://redis.invalid',
  WAREHOUSE_REDIS_TOKEN: 'synthetic-token',
  WAREHOUSE_REDIS_NAMESPACE: 'synthetic-staging',
  WAREHOUSE_VALIDATION_SECRET: 'synthetic-secret-at-least-32-characters',
  WAREHOUSE_VALIDATION_BASE_URL: 'https://store-a.example',
  WAREHOUSE_CHECKOUT_ORIGINS: '["https://checkout.invalid"]',
  BIGCOMMERCE_STORE_HASH: 'synthetic-a',
  BIGCOMMERCE_CHANNEL_ID: '37',
};

function loadTestModule(relativePath, dependencies) {
  const file = path.resolve(__dirname, relativePath);
  const compiled = new Module(file, module);

  compiled.require = (id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected dependency ${id} in ${relativePath}`);
  };

  // eslint-disable-next-line no-underscore-dangle -- Test the actual modules with isolated dependencies.
  compiled._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );

  return compiled.exports;
}

module.exports = { hostedEnv, loadTestModule, warehouse };
