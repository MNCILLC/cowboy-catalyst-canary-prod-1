import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { orderDetailsTransformer } from './order-details-transformer.ts';

const { createFormatter, createTranslator } = await import('next-intl');
const messages = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));
const t = createTranslator({ locale: 'en', messages, namespace: 'Account.Orders.Details' });
const tGiftCertificate = createTranslator({
  locale: 'en',
  messages,
  namespace: 'Cart.GiftCertificate',
});
const format = createFormatter({ locale: 'en', timeZone: 'UTC' });
const money = (value = 0) => ({ value, currencyCode: 'USD' });

function order(nonCouponDiscount = 100, couponDiscount = 0) {
  return {
    entityId: 489,
    orderedAt: { utc: '2026-10-23T12:00:00Z' },
    status: { value: 'AWAITING_FULFILLMENT', label: 'Awaiting fulfillment' },
    subTotal: money(399.04),
    shippingCostTotal: money(449),
    taxTotal: money(20.93),
    totalIncTax: money(868.97 - nonCouponDiscount - couponDiscount),
    discounts: {
      nonCouponDiscountTotal: money(nonCouponDiscount),
      couponDiscounts:
        couponDiscount > 0
          ? [{ couponCode: 'SAVE10', discountedAmount: money(couponDiscount) }]
          : [],
    },
    consignments: { shipping: [], email: [] },
    payments: { edges: [] },
  };
}

const transform = (data = order()) => orderDetailsTransformer(data, t, format, tGiftCertificate);

test('order 489 shows its $100 non-coupon discount and preserves the authoritative total', () => {
  assert.deepEqual(transform().summary, {
    total: '$768.97',
    lineItems: [
      { label: 'Subtotal', value: '$399.04' },
      { label: 'Discounts', value: '-$100.00' },
      { label: 'Shipping', value: '$449.00' },
      { label: 'Tax', value: '$20.93' },
    ],
  });
});

test('coupon and non-coupon discounts each appear once', () => {
  const result = transform(order(100, 10)).summary;

  assert.equal(result.total, '$758.97');
  assert.deepEqual(result.lineItems.slice(1, 3), [
    { label: 'Discounts', value: '-$100.00' },
    { label: 'SAVE10', value: '-$10.00' },
  ]);
});

test('orders without a non-coupon discount omit the extra row', () => {
  [0, 10].forEach((coupon) => {
    const summary = transform(order(0, coupon)).summary;

    assert.equal(
      summary.lineItems.some(({ label }) => label === 'Discounts'),
      false,
    );
    assert.equal(summary.lineItems.length, coupon ? 4 : 3);
  });
});

test('confirmed loyalty redemption shows its point count and keeps other discounts separate', () => {
  const result = transform({
    ...order(110, 10),
    loyaltyRedemption: { points: 1000, amount: 100, currency: 'USD' },
  }).summary;

  assert.deepEqual(result.lineItems.slice(1, 4), [
    { label: 'Loyalty points', value: '-$100.00', subtext: '1,000 points redeemed' },
    { label: 'Discounts', value: '-$10.00' },
    { label: 'SAVE10', value: '-$10.00' },
  ]);
  assert.equal(result.total, '$748.97');
});

test('order 489 displays only the loyalty discount when all non-coupon savings used points', () => {
  const result = transform({
    ...order(),
    loyaltyRedemption: { points: 1000, amount: 100, currency: 'USD' },
  }).summary;

  assert.deepEqual(result.lineItems[1], {
    label: 'Loyalty points',
    value: '-$100.00',
    subtext: '1,000 points redeemed',
  });
  assert.equal(
    result.lineItems.some(({ label }) => label === 'Discounts'),
    false,
  );
  assert.equal(result.total, '$768.97');
});

test('unverified or inconsistent loyalty details preserve the generic discount', () => {
  [
    null,
    { points: 1000, amount: 100, currency: 'EUR' },
    { points: 2000, amount: 200, currency: 'USD' },
  ].forEach((loyaltyRedemption) => {
    const result = transform({ ...order(), loyaltyRedemption }).summary;

    assert.deepEqual(result.lineItems[1], { label: 'Discounts', value: '-$100.00' });
    assert.equal(result.total, '$768.97');
  });
});
