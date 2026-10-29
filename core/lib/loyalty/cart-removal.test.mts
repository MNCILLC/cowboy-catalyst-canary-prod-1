import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { z } from 'zod';

type Item = { entityId: string; parentEntityId?: string; quantity?: number };
type Cart = {
  version: number | null;
  lineItems: {
    physicalItems: Item[];
    digitalItems: Item[];
    giftCertificates: Item[];
    customItems: Item[];
  };
};

// Exercise the real server helpers/actions, substituting only Next/session and
// network boundaries. Ledger restoration is tested separately in the manager.
function harness({ configured = true, signedIn = true, enabled = true } = {}) {
  let cookie: string | undefined = 'cart-1';
  let cart: Cart | null = {
    version: 2,
    lineItems: {
      physicalItems: [{ entityId: 'mob-madness', quantity: 1 }],
      digitalItems: [],
      giftCertificates: [],
      customItems: [],
    },
  };
  let points = 900;
  let reserved = 100;
  let removalError: string | undefined;
  let deletionError: string | undefined;
  const events: string[] = [];
  const balance = () => ({
    enabled,
    currency: 'USD',
    available: points,
    nextExpiry: '2027-10-29T00:00:00.000Z',
    rules: { minimum: 100, maximum: 100000, centsPerPoint: 10 },
    redemption: reserved ? { points: reserved, phase: 'active' } : null,
  });
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    'node:crypto': crypto,
    react: { cache: (fn: unknown) => fn },
    zod: { z },
    '~/auth': { getSessionCustomerAccessToken: async () => (signedIn ? 'session-token' : null) },
    '~/client/graphql': { graphql: (document: string) => document },
    '~/client/tags': { TAGS: { cart: 'cart', checkout: 'checkout' } },
    '~/lib/cart': {
      getCartId: async () => cookie,
      clearCartId: async () => {
        events.push('clear-cookie');
        cookie = undefined;
      },
    },
    'next/cache': { revalidateTag: (tag: string) => events.push(`invalidate:${tag}`) },
    'next-intl/server': { getTranslations: async () => (key: string) => key },
    '~/lib/pro-use/server': {},
    '~/lib/wholesale-pricing': {},
    '~/client': {
      client: {
        fetch: async ({ document, variables, fetchOptions }: any) => {
          assert.equal(fetchOptions.cache, 'no-store');
          if (document.includes('LoyaltyCustomerQuery')) {
            return { data: { customer: { entityId: 3 } } };
          }
          if (document.includes('LoyaltyCartRemovalQuery')) {
            events.push('read-cart');
            return { data: { site: { cart: structuredClone(cart) } } };
          }
          assert.ok(document.includes('DeleteCartLineItemMutation'));
          events.push('delete-item');
          if (deletionError) throw new Error(deletionError);
          assert.ok(cart);
          const input = variables.input;
          if (input.version !== undefined && input.version !== cart.version) {
            throw new Error('cart version conflict');
          }
          const target = input.lineItemEntityId;
          for (const key of Object.keys(cart.lineItems) as (keyof Cart['lineItems'])[]) {
            cart.lineItems[key] = cart.lineItems[key].filter(
              (item) => item.entityId !== target && item.parentEntityId !== target,
            );
          }
          if (Object.values(cart.lineItems).every((items) => items.length === 0)) {
            assert.equal(reserved, 0, 'Never destroy a cart with reserved points');
            cart = null;
          } else {
            cart.version!++;
          }
          return { data: { cart: { deleteCartLineItem: { cart: cart && { entityId: cookie } } } } };
        },
      },
    },
  };
  const fetch = async (_url: URL, options: { body: string }) => {
    const body = JSON.parse(options.body);
    assert.equal(body.customerId, 3, 'Use the authenticated customer');
    assert.equal(body.cartId, cookie, 'Use the server cart cookie');
    events.push(`loyalty:${body.action}`);
    if (body.action === 'remove') {
      assert.ok(cart, 'Discount removal must happen while checkout exists');
      if (removalError) return { ok: false, json: async () => ({ error: removalError }) };
      points += reserved;
      reserved = 0;
      cart.version!++;
    } else {
      assert.equal(body.action, 'balance');
    }
    return { ok: true, json: async () => balance() };
  };
  function load(path: string) {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: any = {};
    runInNewContext(code, {
      exports,
      require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
      process: {
        env: configured
          ? {
              BIGCOMMERCE_STORE_HASH: 'test-store',
              LOYALTY_APP_URL: 'https://loyalty.example',
              LOYALTY_APP_SECRET: 'disposable-test-key',
            }
          : {},
      },
      fetch,
      URL,
      AbortSignal,
    });
    return exports;
  }
  dependencies['~/lib/loyalty/server'] = load('./server.ts');
  const actions = load('../../app/[locale]/(default)/cart/_actions/remove-item.ts');
  dependencies['./remove-item'] = actions;
  const quantity = load('../../app/[locale]/(default)/cart/_actions/update-quantity.ts');
  return {
    remove: (id = 'mob-madness') => actions.removeItem({ lineItemEntityId: id }),
    zeroQuantity: () => quantity.updateQuantity({ lineItemEntityId: 'mob-madness', quantity: 0 }),
    get cart() {
      return cart;
    },
    get points() {
      return points;
    },
    get cookie() {
      return cookie;
    },
    events,
    failRemoval: (error: string) => {
      removalError = error;
    },
    failDeletion: (error?: string) => {
      deletionError = error;
    },
    clearReservation: () => {
      reserved = 0;
      points = 1000;
    },
    newCart: () => {
      cookie = 'cart-2';
      cart = {
        version: 1,
        lineItems: {
          physicalItems: [{ entityId: 'mob-madness' }],
          digitalItems: [],
          giftCertificates: [],
          customItems: [],
        },
      };
      return balance();
    },
  };
}

test('1000 → apply 100 → empty cart → new cart restores all 1000 points', async () => {
  const h = harness();
  assert.equal(h.points, 900);
  await h.remove();
  assert.equal(h.cart, null);
  assert.equal(h.cookie, undefined);
  assert.equal(h.points, 1000);
  assert.deepEqual(h.events, [
    'read-cart',
    'loyalty:balance',
    'loyalty:remove',
    'read-cart',
    'delete-item',
    'clear-cookie',
    'invalidate:cart',
    'invalidate:checkout',
  ]);
  const newBalance = h.newCart();
  assert.equal(newBalance.available, 1000);
  assert.equal(newBalance.redemption, null);
});

test('setting quantity to zero uses the same release-before-delete flow', async () => {
  const h = harness();
  await h.zeroQuantity();
  assert.equal(h.points, 1000);
  assert.equal(h.cart, null);
});

test('a last line with multiple units, digital items, and bundle children is released', async () => {
  for (const scenario of ['multiple-units', 'digital', 'bundle']) {
    const h = harness();
    if (scenario === 'multiple-units') h.cart!.lineItems.physicalItems[0]!.quantity = 4;
    if (scenario === 'digital') {
      h.cart!.lineItems.digitalItems = h.cart!.lineItems.physicalItems;
      h.cart!.lineItems.physicalItems = [];
    }
    if (scenario === 'bundle')
      h.cart!.lineItems.physicalItems.push({ entityId: 'child', parentEntityId: 'mob-madness' });
    await h.remove();
    assert.equal(h.points, 1000);
    assert.equal(h.cart, null);
  }
});

test('non-final deletion preserves applied points, including other item types', async () => {
  for (const kind of [
    'physicalItems',
    'digitalItems',
    'giftCertificates',
    'customItems',
  ] as const) {
    const h = harness();
    h.cart!.lineItems[kind].push({ entityId: 'other' });
    await h.remove();
    assert.equal(h.points, 900);
    assert.ok(h.cart);
    assert.ok(!h.events.includes('loyalty:remove'));
  }
});

test('disabled program still returns an existing reservation', async () => {
  const h = harness({ enabled: false });
  await h.remove();
  assert.equal(h.points, 1000);
});

test('removal failure or in-flight update leaves cart and reservation intact', async () => {
  for (const error of [
    'A points update is in progress. Retry shortly.',
    'Discount removal is not confirmed. Points remain reserved.',
  ]) {
    const h = harness();
    h.failRemoval(error);
    await assert.rejects(h.remove(), { message: error });
    assert.equal(h.points, 900);
    assert.ok(h.cart);
    assert.equal(h.cookie, 'cart-1');
    assert.ok(!h.events.includes('delete-item'));
  }
});

test('retrying after deletion fails does not return points twice', async () => {
  const h = harness();
  h.failDeletion('temporary deletion failure');
  await assert.rejects(h.remove(), /temporary deletion failure/);
  assert.equal(h.points, 1000);
  assert.ok(h.cart);
  h.failDeletion();
  await h.remove();
  assert.equal(h.points, 1000);
  assert.equal(h.cart, null);
  assert.equal(h.events.filter((event) => event === 'loyalty:remove').length, 1);
});

test('simultaneous removals are version fenced; retry releases the final reservation', async () => {
  const h = harness();
  h.cart!.lineItems.physicalItems.push({ entityId: 'other' });
  const results = await Promise.allSettled([h.remove(), h.remove('other')]);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.ok(h.cart);
  assert.equal(h.points, 900);
  await h.remove(h.cart.lineItems.physicalItems[0]!.entityId);
  assert.equal(h.points, 1000);
  assert.equal(h.cart, null);
});

test('guest, unconfigured, and unreserved carts do not call discount removal', async () => {
  for (const options of [{ signedIn: false }, { configured: false }, {}]) {
    const h = harness(options);
    h.clearReservation();
    await h.remove();
    assert.ok(!h.events.includes('loyalty:remove'));
    assert.equal(h.cart, null);
  }
});

test('missing version blocks deletion instead of removing without a concurrency fence', async () => {
  const h = harness();
  h.cart!.version = null;
  await assert.rejects(h.remove(), /could not be verified/);
  assert.ok(!h.events.includes('delete-item'));
  assert.equal(h.points, 900);
});
