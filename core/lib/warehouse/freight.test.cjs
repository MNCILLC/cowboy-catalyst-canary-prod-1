const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const http = require('node:http');
const { test, before, after, beforeEach } = require('node:test');
const ts = require('typescript');
function compile(name, deps) {
  const file = path.resolve(__dirname, name);
  const compiled = new Module(file, module);
  compiled.require = (id) => {
    if (Object.hasOwn(deps, id)) return deps[id];
    if (id === 'zod') return require('zod');
    throw new Error(`Unexpected dependency: ${id}`);
  };
  compiled._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  return compiled.exports;
}
const policy = compile('../freight-cart/policy.ts', {});
const transport = compile('../freight-cart/transport.ts', { './policy': policy });
let prefs,
  requests,
  writes,
  validations,
  rejectMode,
  race,
  outage,
  conflict,
  lostResponse,
  invalidResponse;
const { warehouseFreight } = compile('freight.ts', {
  'server-only': {},
  '~/lib/freight-cart/policy': policy,
  '~/lib/freight-cart/transport': transport,
  './authorization': { WarehouseValidationError: class extends Error {} },
  './validation': {
    validateWarehouseCheckout: async (_token, _origin, _cart, _revision, mode) => {
      validations++;
      if (rejectMode === mode || (race && validations === 2))
        throw new Error('Stale or unauthorized warehouse');
    },
  },
});
const server = http.createServer(async (req, res) => {
  requests++;
  assert.equal(req.headers.authorization, `Bearer ${'x'.repeat(32)}`);
  assert.equal(req.headers['x-freight-store-hash'], 'synthetic');
  res.setHeader('Content-Type', 'application/json');
  if (outage) {
    res.writeHead(503).end('{}');
    return;
  }
  if (invalidResponse) {
    res.end(invalidResponse);
    return;
  }
  if (req.method === 'PUT') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const update = JSON.parse(body);
    if (conflict || update.expectedVersion !== (prefs?.version ?? 0)) {
      res.writeHead(409).end('{}');
      return;
    }
    writes++;
    prefs = {
      fulfillmentMethod: update.fulfillmentMethod,
      accessorials: update.accessorials,
      version: update.expectedVersion + 1,
    };
    if (lostResponse) {
      lostResponse = false;
      req.socket.destroy();
      return;
    }
  }
  res.end(JSON.stringify({ preferences: prefs }));
});
const original = { ...process.env };
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.FREIGHT_APP_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.FREIGHT_APP_CHECKOUT_TOKEN = 'x'.repeat(32);
  process.env.BIGCOMMERCE_STORE_HASH = 'synthetic';
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const key of [
    'FREIGHT_APP_URL',
    'FREIGHT_APP_CHECKOUT_TOKEN',
    'BIGCOMMERCE_STORE_HASH',
    'WAREHOUSE_FREIGHT_ENABLED',
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
beforeEach(() => {
  prefs = null;
  requests = writes = validations = 0;
  rejectMode = 'never';
  race = outage = conflict = lostResponse = false;
  invalidResponse = undefined;
  process.env.WAREHOUSE_FREIGHT_ENABLED = 'true';
});
const call = (update) =>
  warehouseFreight(
    'signed-test',
    'https://checkout.invalid',
    '00000000-0000-4000-8000-000000000001',
    'revision',
    update,
  );
const update = (version, method = 'ship', codes = ['HYD']) => ({
  selection: { fulfillmentMethod: method, accessorials: codes },
  expectedVersion: version,
});
test('reads and writes actual HTTP preferences, validating warehouse before and after', async () => {
  assert.equal((await call()).preferences, null);
  const result = await call(update(0));
  assert.deepEqual(result.preferences, {
    fulfillmentMethod: 'ship',
    accessorials: ['HYD'],
    version: 1,
  });
  assert.equal(validations, 4);
  assert.equal(writes, 1);
});
test('pickup clears shipping services and deduplicates shipping choices', async () => {
  await call(update(0, 'ship', ['HYD', 'HYD']));
  assert.deepEqual(prefs.accessorials, ['HYD']);
  await call(update(1, 'pickup'));
  assert.deepEqual(prefs.accessorials, []);
});
test('stale tab cannot overwrite another selection', async () => {
  await call(update(0));
  await assert.rejects(call(update(0, 'ship', ['IDC'])), transport.FreightPreferenceConflict);
  assert.equal(writes, 1);
  assert.deepEqual(prefs.accessorials, ['HYD']);
});
test('lost write response can be retried without incrementing again', async () => {
  lostResponse = true;
  await assert.rejects(call(update(0)));
  assert.equal((await call(update(0))).preferences.version, 1);
  assert.equal(writes, 1);
});
test('upstream compare-and-swap conflict is preserved', async () => {
  conflict = true;
  await assert.rejects(call(update(0)), transport.FreightPreferenceConflict);
  assert.equal(writes, 0);
});
test('Powell shipping is rejected before HTTP calls', async () => {
  rejectMode = 'shipping';
  await assert.rejects(call(update(0)), /unauthorized/);
  assert.equal(requests, 0);
});
test('warehouse change during remote write fails closed', async () => {
  race = true;
  await assert.rejects(call(update(0)), /Stale/);
  assert.equal(writes, 1);
});
test('disabled integration performs no warehouse or HTTP operations', async () => {
  process.env.WAREHOUSE_FREIGHT_ENABLED = 'false';
  await assert.rejects(call(update(0)), /unavailable/);
  assert.equal(requests, 0);
  assert.equal(validations, 0);
});
test('upstream outage fails without writes', async () => {
  outage = true;
  await assert.rejects(call(update(0)), /Unable/);
  assert.equal(writes, 0);
});

test('HTTP outage retains only safe diagnostic metadata and never retries a write', async () => {
  outage = true;
  await assert.rejects(call(update(0)), (error) => {
    assert.ok(error instanceof transport.FreightPreferenceUnavailable);
    assert.equal(error.reason, 'http');
    assert.equal(error.upstreamStatus, 503);
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify(error).includes(process.env.FREIGHT_APP_CHECKOUT_TOKEN));
    return true;
  });
  assert.equal(requests, 1);
  assert.equal(writes, 0);
});
['<html>unavailable</html>', '{"preferences":{"version":"bad"}}'].forEach((body, index) => {
  test(`malformed upstream data ${index} is unavailable, not an invalid shopper request`, async () => {
    invalidResponse = body;
    await assert.rejects(call(), (error) => {
      assert.ok(error instanceof transport.FreightPreferenceUnavailable);
      assert.equal(error.reason, 'invalid-response');
      assert.equal(error.upstreamStatus, 200);
      assert.ok(!JSON.stringify(error).includes(body));
      return true;
    });
    assert.equal(writes, 0);
  });
});
