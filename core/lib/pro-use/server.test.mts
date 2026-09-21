import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { z } from 'zod';

import * as policy from './policy.ts';

// Exercise the actual server modules with only network/session/framework boundaries mocked.
function harness({
  signedIn = false,
  certified = false,
  cartExists = true,
  productStatus = 200,
} = {}) {
  const requests: Array<{ url: string; cache: string }> = [];
  const mutations: string[] = [];
  const client = {
    fetch: async ({ document, customerAccessToken, fetchOptions, variables }: any) => {
      assert.equal(fetchOptions.cache, 'no-store');
      if (document.includes('ProUseCustomerIdentityQuery')) {
        assert.equal(customerAccessToken, 'signed-session');
        return { data: { customer: { entityId: 77 } } };
      }
      if (document.includes('ProUseCartProductsQuery')) {
        return {
          data: {
            site: {
              cart: cartExists
                ? {
                    lineItems: {
                      physicalItems: [{ entityId: 'physical', productEntityId: 42 }],
                      digitalItems: [{ entityId: 'digital', productEntityId: 1603 }],
                    },
                  }
                : null,
            },
          },
        };
      }
      if (document.includes('ProUseVariantOwnershipQuery')) {
        return {
          data: {
            site: {
              product: {
                variants: {
                  edges: variables.variantId === 100 ? [{ node: { entityId: 100 } }] : [],
                },
              },
            },
          },
        };
      }
      mutations.push(document);
      return { data: { cart: {} } };
    },
  };
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    react: { cache: (fn: unknown) => fn },
    zod: { z },
    '~/auth': {
      getSessionCustomerAccessToken: async () => (signedIn ? 'signed-session' : undefined),
    },
    '~/client': { client },
    '~/client/graphql': { graphql: (document: string) => document },
    '~/lib/currency': { getPreferredCurrencyCode: async () => 'USD' },
    './policy': policy,
  };
  function load(path: string) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: any = {};
    runInNewContext(code, {
      exports,
      require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency ${name}`);
        return dependencies[name];
      },
      process: {
        env: { BIGCOMMERCE_STORE_HASH: 'test-store', BIGCOMMERCE_ACCESS_TOKEN: 'server-secret' },
      },
      fetch: async (url: string, options: any) => {
        requests.push({ url, cache: options.cache });
        assert.equal(options.cache, 'no-store');
        assert.equal(options.headers['X-Auth-Token'], 'server-secret');
        const parsed = new URL(url);
        const namespace = parsed.searchParams.get('namespace');
        let fields: Array<{ key: string; value: string }> = [];
        if (parsed.pathname.includes('/customers/')) {
          assert.ok(
            parsed.pathname.includes('/customers/77/'),
            'Identity must come from the authenticated query',
          );
          fields = [
            { key: 'is_pro_use', value: String(certified) },
            { key: 'pro_use_cert_expiration', value: '2000-01-01' },
          ];
        } else if (parsed.pathname.includes('/products/1603/')) {
          fields = [{ key: 'pro_use_only', value: 'true' }];
        } else if (parsed.pathname.includes('/store/')) {
          fields = [{ key: 'pro_use_message', value: '<h3>Pro Use Cert Required</h3>' }];
        }
        const status = parsed.pathname.includes('/products/') ? productStatus : 200;
        return new Response(
          JSON.stringify({ data: fields.map((field) => ({ ...field, namespace })) }),
          { status },
        );
      },
    });
    return exports;
  }
  const server = load('./server.ts');
  dependencies['~/lib/pro-use/server'] = server;
  return { server, load, requests, mutations };
}

test('private certification is loaded using authenticated customer identity and no shared cache', async () => {
  const h = harness({ signedIn: true, certified: true });
  const certification = await h.server.getCustomerProUseCertification();
  assert.equal(certification.isCertified, true);
  assert.equal(certification.expiration, '2000-01-01');
  assert.equal(h.requests.length, 1);
});

test('guest display hides controls and loads the actual site HTML message', async () => {
  const h = harness();
  const display = await h.server.getProUseDisplayAccess();
  assert.equal(display.isCertified, false);
  assert.equal(display.message, '<h3>Pro Use Cert Required</h3>');
  assert.equal(
    h.requests.some(({ url }) => url.includes('/customers/')),
    false,
  );
});

test('both create and add mutations reject a forged restricted product before any mutation', async () => {
  for (const signedIn of [false, true]) {
    const h = harness({ signedIn });
    const create = h.load('../cart/create-cart.ts').createCart;
    const add = h.load('../cart/add-cart-line-item.ts').addCartLineItem;
    const data = { lineItems: [{ productEntityId: 1603, quantity: 1 }] };
    await assert.rejects(create(data), policy.ProUseRequiredError);
    await assert.rejects(add('cart-id', data), policy.ProUseRequiredError);
    assert.equal(h.mutations.length, 0);
  }
});

test('certified customers reach cart mutation; unrestricted products still work for guests', async () => {
  for (const configuration of [
    { signedIn: true, certified: true, productId: 1603 },
    { signedIn: false, certified: false, productId: 42 },
  ]) {
    const h = harness(configuration);
    await h
      .load('../cart/create-cart.ts')
      .createCart({ lineItems: [{ productEntityId: configuration.productId, quantity: 1 }] });
    await h.load('../cart/add-cart-line-item.ts').addCartLineItem('cart-id', {
      lineItems: [{ productEntityId: configuration.productId, quantity: 1 }],
    });
    assert.equal(h.mutations.length, 2);
  }
});

test('checkout checks include digital items in existing mixed carts and reject missing carts', async () => {
  const h = harness();
  await assert.rejects(h.server.assertProUseCart('cart-id'), policy.ProUseRequiredError);
  await h.server.assertProUseCart('cart-id', 'physical');
  await assert.rejects(h.server.assertProUseCart('cart-id', 'digital'), policy.ProUseRequiredError);
  await assert.rejects(
    h.server.assertProUseCart('cart-id', 'unknown'),
    /Unable to verify cart item/,
  );
  await assert.rejects(
    harness({ cartExists: false }).server.assertProUseCart('missing'),
    /Unable to verify cart/,
  );
});

test('Management API failure prevents mutation, even for a certified session', async () => {
  const h = harness({ signedIn: true, certified: true, productStatus: 503 });
  await assert.rejects(
    h
      .load('../cart/create-cart.ts')
      .createCart({ lineItems: [{ productEntityId: 1603, quantity: 1 }] }),
    /Unable to verify Pro Use/,
  );
  assert.equal(h.mutations.length, 0);
});

test('alternate SKU and mismatched variant identities cannot bypass product checks', async () => {
  const h = harness();
  const create = h.load('../cart/create-cart.ts').createCart;
  await assert.rejects(
    create({ lineItems: [{ productEntityId: 42, sku: 'restricted-sku', quantity: 1 }] }),
    /Product IDs are required/,
  );
  await assert.rejects(
    create({ lineItems: [{ productEntityId: 42, variantEntityId: 999, quantity: 1 }] }),
    /Unable to verify product variant/,
  );
  assert.equal(h.mutations.length, 0);
  await create({ lineItems: [{ productEntityId: 42, variantEntityId: 100, quantity: 1 }] });
  assert.equal(h.mutations.length, 1);
});
