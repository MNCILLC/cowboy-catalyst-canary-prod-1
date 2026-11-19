import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeWarehouseAvailability as describe,
  warehouseCardDisplay,
  unknownAvailability,
} from './availability-policy.ts';

const product = { id: 1, type: 'physical', inventory_tracking: 'product' };
const row = (quantity: number, variantId: number | null = null, productId = 1) => ({
  identity: { product_id: productId, variant_id: variantId },
  available_to_sell: quantity,
});
test('uses only the requested product and never borrows stock from another warehouse response', () => {
  assert.equal(describe(product, [row(8), row(100, null, 2)], 'North').quantity, 8);
  assert.equal(describe(product, [], 'South').canPurchase, false);
  assert.match(describe(product, [], 'South').message, /Out of stock.*South/);
});
test('zero, missing, negative and disabled stock cannot be purchased', () => {
  for (const items of [
    [],
    [row(0)],
    [row(-4)],
    [{ ...row(50), settings: { is_in_stock: false } }],
  ]) {
    assert.equal(describe(product, items, 'North').canPurchase, false);
  }
});
test('invalid or ambiguous stock is unknown, never an affirmative stock claim', () => {
  for (const items of [[row(NaN)], [row(Infinity)], [row(4), row(5)]]) {
    assert.deepEqual(describe(product, items, 'North'), unknownAvailability());
  }
});
test('variant cards require selection and do not sum counts', () => {
  const variants = { ...product, inventory_tracking: 'variant' };
  const items = [row(2, 10), row(0, 11), row(7, 12)];
  const summary = describe(variants, items, 'North');
  assert.equal(summary.quantity, undefined);
  assert.equal(summary.canPurchase, false);
  assert.equal(summary.selectionRequired, 'options');
  assert.match(summary.message, /Options available/);
  assert.equal(describe(variants, items, 'North', 10).quantity, 2);
  assert.equal(describe(variants, items, 'North', 11).canPurchase, false);
  assert.equal(describe(variants, items, 'North', 99).canPurchase, false);
  assert.equal(warehouseCardDisplay(summary).isInStock, undefined);
});
test('untracked physical products fail closed; digital products need no stock', () => {
  assert.equal(
    describe({ ...product, inventory_tracking: 'none' }, [], 'North').canPurchase,
    false,
  );
  assert.equal(describe({ ...product, type: 'digital' }, [], 'North').canPurchase, true);
  assert.equal(describe(undefined, [row(99)], 'North').canPurchase, false);
});
test('warehouse display replaces aggregate and backorder claims while off mode is unchanged', () => {
  assert.deepEqual(warehouseCardDisplay(undefined), {});
  const display = warehouseCardDisplay(describe(product, [row(3)], 'North'));
  assert.equal(display.stockDisplayData?.backorderAvailabilityPrompt, null);
  assert.equal(display.useEnhancedStockDisplay, true);
  assert.match(display.inventoryMessage ?? '', /3 available.*North/);
});
