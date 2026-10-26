import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import * as jose from 'jose';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = 'test-access-code-strong';
const secret = 'test-signing-secret-with-at-least-32-characters';
const origin = 'https://store.example';

function harness(overrides: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = {
    STOREFRONT_PREVIEW_ENABLED: 'true',
    STOREFRONT_PREVIEW_CODE: code,
    STOREFRONT_PREVIEW_SECRET: secret,
    NODE_ENV: 'production',
    ...overrides,
  };
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    'node:crypto': require('node:crypto'),
    jose,
    'next/server': { NextRequest, NextResponse },
    'lru-cache': require('lru-cache'),
  };
  function load(path: string) {
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: any = {};
    runInNewContext(compiled, {
      exports,
      process: { env },
      Buffer,
      URL,
      URLSearchParams,
      require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
    });
    return exports;
  }
  const access = load('./preview-access.ts');
  dependencies['~/lib/preview-access'] = access;
  const { withStorefrontPreview } = load('../proxies/with-storefront-preview.ts');
  const route = load('../app/api/storefront-preview/route.ts');
  let downstreamCalls = 0;
  const proxy = withStorefrontPreview(() => {
    downstreamCalls++;
    return NextResponse.next();
  });
  return {
    access,
    proxy,
    route,
    env,
    get downstreamCalls() {
      return downstreamCalls;
    },
  };
}

function request(path: string, token?: string, method = 'GET') {
  return new NextRequest(`${origin}${path}`, {
    method,
    headers: token ? { cookie: `storefront-preview-access=${token}` } : {},
  });
}

function submission(
  value: string,
  returnTo = '/category?sort=price',
  extra: Record<string, string> = {},
) {
  return new NextRequest(`${origin}/api/storefront-preview`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...extra },
    body: new URLSearchParams({ code: value, returnTo }),
  });
}

test('signed access expires and cannot survive tampering or code/secret rotation', async () => {
  const { access } = harness();
  const token = await access.createPreviewSession(code, secret);
  assert.equal(await access.hasPreviewSession(token, code, secret), true);
  assert.equal(await access.hasPreviewSession(`${token}broken`, code, secret), false);
  assert.equal(await access.hasPreviewSession(undefined, code, secret), false);
  assert.equal(await access.hasPreviewSession(token, 'rotated-code', secret), false);
  assert.equal(await access.hasPreviewSession(token, code, `${secret}rotated`), false);
  assert.equal(JSON.stringify(jose.decodeJwt(token)).includes(code), false);
  const expired = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('catalyst-storefront-preview')
    .setAudience('storefront')
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(createHmac('sha256', secret).update(code).digest());
  assert.equal(await access.hasPreviewSession(expired, code, secret), false);
});

test('return paths remain local and cannot loop through the gate or reach APIs', () => {
  const { access } = harness();
  for (const path of [
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%5cevil.example',
    '/%2fevil.example',
    '/%0aevil',
    '/bad%encoding',
    '/storefront-preview',
    '/foo/../storefront-preview',
    '/api/products',
    '/_next/static/a',
  ]) {
    assert.equal(access.safePreviewReturnPath(path), '/', String(path));
  }
  assert.equal(
    access.safePreviewReturnPath('/en/category?page=2&sort=price'),
    '/en/category?page=2&sort=price',
  );
  assert.equal(access.matchesPreviewCode(code, code), true);
  assert.equal(access.matchesPreviewCode('wrong', code), false);
});

test('pages, localized paths, sitemap and forged draft requests stay gated', async () => {
  const h = harness();
  for (const path of [
    '/',
    '/en/account',
    '/products?sort=price',
    '/sitemap.xml',
    '/xmlsitemap.php',
    '/admin',
    '/apiary',
    '/?__makeswift_preview=true',
  ]) {
    const response = await h.proxy(request(path, 'forged'), {});
    assert.equal(response.status, 303, path);
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.pathname, '/storefront-preview');
    assert.equal(destination.searchParams.get('returnTo'), path);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal(h.downstreamCalls, 0);
});

test('catalog APIs, GraphQL and Server Actions reject missing access without redirecting POSTs', async () => {
  const h = harness();
  for (const [path, method] of [
    ['/api/products/123', 'GET'],
    ['/api/wholesale-pricing', 'POST'],
    ['/graphql', 'POST'],
    ['/en/cart', 'POST'],
  ]) {
    const response = await h.proxy(request(path!, undefined, method), {});
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('location'), null);
  }
  assert.equal(h.downstreamCalls, 0);
});

test('gate and authenticated Makeswift API are reachable; robots disallows crawling', async () => {
  const h = harness();
  for (const path of [
    '/storefront-preview',
    '/api/storefront-preview',
    '/api/makeswift/manifest',
  ]) {
    assert.equal((await h.proxy(request(path), {})).status, 200);
  }
  const robots = await h.proxy(request('/robots.txt'), {});
  assert.match(await robots.text(), /Disallow: \//);
  assert.equal(h.downstreamCalls, 0);
});

test('valid cookies reach downstream routing and gate redirects to the original destination', async () => {
  const h = harness();
  const token = await h.access.createPreviewSession(code, secret);
  assert.equal((await h.proxy(request('/en/products', token), {})).status, 200);
  assert.equal(h.downstreamCalls, 1);
  const response = await h.proxy(
    request('/storefront-preview?returnTo=%2Fen%2Fproducts', token),
    {},
  );
  assert.equal(response.headers.get('location'), `${origin}/en/products`);
});

test('preview access defaults to disabled when the flag is absent, blank, or not exactly true', async () => {
  for (const value of [undefined, '', 'false', 'FALSE', '0', '1', 'TRUE', ' true ']) {
    const h = harness();
    if (value === undefined) delete h.env.STOREFRONT_PREVIEW_ENABLED;
    else h.env.STOREFRONT_PREVIEW_ENABLED = value;

    assert.equal(h.access.getPreviewConfig().enabled, false, String(value));
    for (const [path, method] of [
      ['/', 'GET'],
      ['/api/products/123', 'GET'],
      ['/graphql', 'POST'],
      ['/cart', 'POST'],
      ['/robots.txt', 'GET'],
    ]) {
      const response = await h.proxy(request(path!, undefined, method), {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('X-Robots-Tag'), null);
    }
    assert.equal(h.downstreamCalls, 5);

    const gate = await h.proxy(request('/storefront-preview?returnTo=%2Fcart'), {});
    assert.equal(gate.headers.get('location'), `${origin}/cart`);

    delete h.env.STOREFRONT_PREVIEW_CODE;
    delete h.env.STOREFRONT_PREVIEW_SECRET;
    const submissionResponse = await h.route.POST(submission(code));
    assert.equal(submissionResponse.status, 303);
    assert.equal(submissionResponse.headers.get('location'), `${origin}/`);
    assert.equal(submissionResponse.cookies.get('storefront-preview-access'), undefined);
  }
});

test('disabled gate preserves public access and enabled incomplete configuration fails closed', async () => {
  const disabled = harness({ STOREFRONT_PREVIEW_ENABLED: 'false' });
  assert.equal((await disabled.proxy(request('/'), {})).status, 200);
  assert.equal(disabled.downstreamCalls, 1);
  for (const settings of [
    { STOREFRONT_PREVIEW_CODE: '' },
    { STOREFRONT_PREVIEW_SECRET: '' },
    { STOREFRONT_PREVIEW_SECRET: 'short' },
  ]) {
    const h = harness(settings);
    assert.equal((await h.proxy(request('/'), {})).status, 303);
    assert.equal((await h.route.POST(submission(code))).status, 503);
    assert.equal(h.downstreamCalls, 0);
  }
});

test('form issues secure HttpOnly access and retains the path and query', async () => {
  const h = harness();
  const response = await h.route.POST(submission(code));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${origin}/category?sort=price`);
  const cookie = response.cookies.get('storefront-preview-access');
  assert.ok(cookie);
  assert.equal(await h.access.hasPreviewSession(cookie.value, code, secret), true);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.maxAge, 604800);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(
    (await h.route.POST(submission(code, '//evil.example'))).headers.get('location'),
    `${origin}/`,
  );
});

test('invalid code stays private and never sets an access cookie', async () => {
  const h = harness();
  const response = await h.route.POST(submission('wrong-secret'));
  assert.equal(response.status, 303);
  assert.match(response.headers.get('location')!, /error=invalid/);
  assert.equal(response.headers.get('location')!.includes('wrong-secret'), false);
  assert.equal(response.cookies.get('storefront-preview-access'), undefined);
});

test('submission rejects cross-origin forms, oversized bodies, wrong content types and excessive attempts', async () => {
  const h = harness();
  assert.equal(
    (await h.route.POST(submission(code, '/', { origin: 'https://evil.example' }))).status,
    403,
  );
  assert.equal((await h.route.POST(submission('x'.repeat(9000)))).status, 413);
  assert.equal(
    (await h.route.POST(submission(code, '/', { 'content-type': 'application/json' }))).status,
    400,
  );
  const throttled = harness();
  for (let i = 0; i < 10; i++)
    assert.equal((await throttled.route.POST(submission('wrong'))).status, 303);
  const response = await throttled.route.POST(submission('wrong'));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '900');
});
