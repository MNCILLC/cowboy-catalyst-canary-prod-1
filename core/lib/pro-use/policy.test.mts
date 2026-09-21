import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  authorizeProUseProducts,
  getProUseCertification,
  isProUseProduct,
  isTrueMetafield,
  ProUseRequiredError,
} from './policy.ts';

test('missing and false metafields do not enable Pro Use', () => {
  for (const value of [undefined, '', 'false', '0', '1', 'yes', 'null', '"true"']) {
    assert.equal(isTrueMetafield(value), false);
  }
  assert.equal(isTrueMetafield('true'), true);
  assert.equal(isTrueMetafield(' TRUE '), true);
  assert.equal(isProUseProduct({}), false);
  assert.equal(isProUseProduct({ proUseMetafields: { edges: [] } }), false);
  assert.equal(
    isProUseProduct({ proUseMetafields: { edges: [{ node: { value: 'false' } }] } }),
    false,
  );
  assert.equal(
    isProUseProduct({ proUseMetafields: { edges: [{ node: { value: 'true' } }] } }),
    true,
  );
  assert.deepEqual(getProUseCertification([]), { isCertified: false, expiration: null });
});

test('expiration remains informational, including expired and malformed values', () => {
  for (const expiration of ['2000-01-01', '2099-01-01', 'unknown']) {
    assert.deepEqual(
      getProUseCertification([
        { key: 'is_pro_use', value: 'true' },
        { key: 'pro_use_cert_expiration', value: expiration },
      ]),
      { isCertified: true, expiration },
    );
    assert.equal(
      getProUseCertification([{ key: 'pro_use_cert_expiration', value: expiration }]).isCertified,
      false,
    );
  }
});

test('guests and uncertified customers cannot purchase any restricted item', async () => {
  for (const fields of [[], [{ key: 'is_pro_use', value: 'false' }]]) {
    await assert.rejects(
      authorizeProUseProducts([42, 1603], {
        isProductRestricted: async (id) => id === 1603,
        getCertification: async () => getProUseCertification(fields),
      }),
      ProUseRequiredError,
    );
  }
});

test('certified customers can purchase restricted and mixed carts despite past expiration', async () => {
  await authorizeProUseProducts([42, 1603], {
    isProductRestricted: async (id) => id === 1603,
    getCertification: async () =>
      getProUseCertification([
        { key: 'is_pro_use', value: 'true' },
        { key: 'pro_use_cert_expiration', value: '2000-01-01' },
      ]),
  });
});

test('unrestricted and gift-certificate-only carts do not require certification', async () => {
  for (const ids of [[], [42]]) {
    await authorizeProUseProducts(ids, {
      isProductRestricted: async () => false,
      getCertification: async () => {
        throw new Error('Certification should not be read');
      },
    });
  }
});

test('lookup failures block mutations instead of treating unknown restrictions as absent', async () => {
  await assert.rejects(
    authorizeProUseProducts([1603], {
      isProductRestricted: async () => {
        throw new Error('Product API unavailable');
      },
      getCertification: async () => ({ isCertified: true }),
    }),
    /Product API unavailable/,
  );
  await assert.rejects(
    authorizeProUseProducts([1603], {
      isProductRestricted: async () => true,
      getCertification: async () => {
        throw new Error('Customer API unavailable');
      },
    }),
    /Customer API unavailable/,
  );
});

test('every product is checked once, and invalid IDs cannot bypass verification', async () => {
  const checked: number[] = [];
  await authorizeProUseProducts([42, 1603, 1603], {
    isProductRestricted: async (id) => {
      checked.push(id);
      return id === 1603;
    },
    getCertification: async () => ({ isCertified: true }),
  });
  assert.deepEqual(checked, [42, 1603]);
  for (const id of [0, -1, NaN, Infinity, 1.5]) {
    await assert.rejects(
      authorizeProUseProducts([id], {
        isProductRestricted: async () => false,
        getCertification: async () => ({ isCertified: true }),
      }),
      /Invalid product ID/,
    );
  }
});
