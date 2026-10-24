import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hideWholesaleCardPrices,
  hideWholesalePrices,
  requiresWholesaleLogin,
} from './wholesale-pricing-policy.ts';

test('only guests with the explicit flag enabled require login', () => {
  for (const enabled of [undefined, '', 'false', 'true']) {
    for (const authenticated of [false, true]) {
      assert.equal(
        requiresWholesaleLogin(enabled, authenticated),
        enabled === 'true' && !authenticated,
      );
    }
  }
});

const product = {
  name: 'Wholesale product',
  showCartAction: true,
  pricesIncludingTax: {
    price: { value: 97 },
    basePrice: { value: 120 },
    salePrice: { value: 97 },
    priceRange: { min: { value: 97 }, max: { value: 112 } },
  },
  pricesExcludingTax: {
    price: { value: 90 },
    basePrice: { value: 110 },
    salePrice: { value: 90 },
    priceRange: { min: { value: 90 }, max: { value: 100 } },
  },
};

test('guest catalog responses contain no current, sale, base, or range prices', () => {
  const result = hideWholesalePrices(product, true);
  assert.equal(result.pricesIncludingTax, null);
  assert.equal(result.pricesExcludingTax, null);
  assert.equal(result.showCartAction, false);
  assert.equal(result.pricingRequiresLogin, true);
  assert.equal(result.name, product.name);
  assert.doesNotMatch(JSON.stringify(result), /"value"/);
  // Redaction must not alter cached data used by other requests.
  assert.equal(product.pricesIncludingTax.price.value, 97);
  assert.equal(product.showCartAction, true);
});

test('logged-in users and disabled gating retain prices and purchasing state', () => {
  for (const [enabled, authenticated] of [
    ['true', true],
    ['false', false],
    [undefined, false],
  ] as const) {
    assert.deepEqual(hideWholesalePrices(product, requiresWholesaleLogin(enabled, authenticated)), {
      ...product,
      pricingRequiresLogin: false,
    });
  }
});

test('restricted cards replace every price variant and remove purchasing', () => {
  for (const price of [
    undefined,
    '$97',
    { type: 'plain', money: { ex: '$97', inc: '$100' } },
    { type: 'sale', previous: '$120', current: '$97' },
    { type: 'range', min: '$97', max: '$112' },
  ]) {
    const card = { title: 'Product', price, canAddToCart: true };
    assert.deepEqual(hideWholesaleCardPrices(card, true), {
      title: 'Product',
      price: { type: 'login' },
      canAddToCart: false,
      pricingRequiresLogin: true,
    });
    assert.deepEqual(hideWholesaleCardPrices(card, false), {
      ...card,
      pricingRequiresLogin: false,
    });
  }
});
