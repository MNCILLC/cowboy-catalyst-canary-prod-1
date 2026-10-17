import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveRelatedProducts } from './related-products.ts';

const products = (...ids: string[]) => ids.map((id) => ({ id }));
const unexpected = async (): Promise<never> => {
  throw new Error('Fallback must not be requested');
};

test('manual relationships win, retain order, and are not filled with category suggestions', async () => {
  const result = await resolveRelatedProducts({
    productId: '1',
    relatedProducts: products('1', '4', '3', '4'),
    getCategoryIds: unexpected,
    getCategoryPage: unexpected,
  });
  assert.deepEqual(result, products('4', '3'));
});

test('fallback follows category priority, skips self and duplicates, and stops at eight', async () => {
  const calls: Array<[number, string | undefined]> = [];
  const result = await resolveRelatedProducts({
    productId: '1',
    relatedProducts: [],
    getCategoryIds: async () => [36, 36, 47, 99],
    getCategoryPage: async (id, after) => {
      calls.push([id, after]);
      if (id === 36 && !after)
        return { products: products('1', '2', '3'), hasNextPage: true, endCursor: 'next' };
      if (id === 36) return { products: products('3', '4'), hasNextPage: false };
      return {
        products: products('2', '5', '6', '7', '8', '9', '10'),
        hasNextPage: true,
        endCursor: 'unused',
      };
    },
  });
  assert.deepEqual(result, products('2', '3', '4', '5', '6', '7', '8', '9'));
  assert.deepEqual(calls, [
    [36, undefined],
    [36, 'next'],
    [47, undefined],
  ]);
});

test('self-only manual results and filtered-empty category pages still allow fallback', async () => {
  const result = await resolveRelatedProducts({
    productId: '1',
    relatedProducts: products('1'),
    getCategoryIds: async () => [36],
    getCategoryPage: async (_id, after) =>
      after
        ? { products: products('2'), hasNextPage: false }
        : { products: [], hasNextPage: true, endCursor: 'next' },
  });
  assert.deepEqual(result, products('2'));
});

test('products with no categories or no other eligible products return an empty list', async () => {
  assert.deepEqual(
    await resolveRelatedProducts({
      productId: '1',
      relatedProducts: [],
      getCategoryIds: async () => [],
      getCategoryPage: unexpected,
    }),
    [],
  );
  assert.deepEqual(
    await resolveRelatedProducts({
      productId: '1',
      relatedProducts: [],
      getCategoryIds: async () => [36],
      getCategoryPage: async () => ({ products: products('1'), hasNextPage: false }),
    }),
    [],
  );
});

test('a repeated pagination cursor does not loop forever', async () => {
  let calls = 0;
  const result = await resolveRelatedProducts({
    productId: '1',
    relatedProducts: [],
    getCategoryIds: async () => [36],
    getCategoryPage: async () => {
      calls++;
      return { products: products('2'), hasNextPage: true, endCursor: 'same' };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, products('2'));
});
