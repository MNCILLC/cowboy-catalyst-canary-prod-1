import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { getStockDisplayData } from '../../lib/stock-display.ts';

const settings = {
  stockLevelDisplay: 'SHOW',
  showOutOfStockMessage: true,
  defaultOutOfStockMessage: 'Sold out',
  showBackorderAvailabilityPrompt: false,
  backorderAvailabilityPrompt: 'Available on backorder',
  showBackorderMessage: false,
  showQuantityOnBackorder: false,
};
const inventory = (quantity, warningLevel = 5) => ({
  isInStock: true,
  aggregated: {
    availableToSell: quantity,
    availableOnHand: quantity,
    warningLevel,
    unlimitedBackorder: false,
  },
});
const formatStock = (quantity) => `Current stock: ${quantity}`;
const display = (stock, overrides = {}) =>
  getStockDisplayData(stock, { ...settings, ...overrides }, formatStock);
const flagNames = ['ENABLE_LOW_STOCK_MESSAGE', 'ENABLE_IN_STOCK_MESSAGE'];
let savedFlags;

beforeEach(() => {
  savedFlags = flagNames.map((name) => process.env[name]);
  flagNames.forEach((name) => delete process.env[name]);
});

afterEach(() => {
  flagNames.forEach((name, index) => {
    if (savedFlags[index] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedFlags[index];
    }
  });
});

test('low stock includes the threshold and uses the error state when enabled', () => {
  flagNames.forEach((name) => {
    process.env[name] = 'true';
  });
  [1, 4, 5].forEach((quantity) => {
    assert.deepEqual(display(inventory(quantity)), {
      stockLevelMessage: `ONLY ${quantity} IN STOCK`,
      stockLevelStatus: 'error',
      backorderAvailabilityPrompt: null,
    });
  });
  assert.equal(display(inventory(6)).stockLevelMessage, 'IN STOCK');
  assert.equal(display(inventory(6)).stockLevelStatus, undefined);
  assert.equal(display(inventory(1, 0)).stockLevelMessage, 'IN STOCK');
});

test('each flag independently restores the original text for its stock condition', () => {
  ['true', 'false'].forEach((low) => {
    ['true', 'false'].forEach((normal) => {
      process.env.ENABLE_LOW_STOCK_MESSAGE = low;
      process.env.ENABLE_IN_STOCK_MESSAGE = normal;
      assert.equal(
        display(inventory(3)).stockLevelMessage,
        low === 'true' ? 'ONLY 3 IN STOCK' : 'Current stock: 3',
      );
      assert.equal(display(inventory(3)).stockLevelStatus, low === 'true' ? 'error' : undefined);
      assert.equal(
        display(inventory(10)).stockLevelMessage,
        normal === 'true' ? 'IN STOCK' : 'Current stock: 10',
      );
    });
  });
});

test('DONT_SHOW preserves hidden levels and the existing out-of-stock setting', () => {
  ['true', 'false'].forEach((low) => {
    ['true', 'false'].forEach((normal) => {
      process.env.ENABLE_LOW_STOCK_MESSAGE = low;
      process.env.ENABLE_IN_STOCK_MESSAGE = normal;
      [0, 1, 5, 10].forEach((quantity) => {
        assert.equal(display(inventory(quantity), { stockLevelDisplay: 'DONT_SHOW' }), null);
      });
      assert.deepEqual(display({ isInStock: false }, { stockLevelDisplay: 'DONT_SHOW' }), {
        stockLevelMessage: 'Sold out',
        backorderAvailabilityPrompt: null,
      });
      assert.equal(
        display(
          { isInStock: false },
          { stockLevelDisplay: 'DONT_SHOW', showOutOfStockMessage: false },
        ),
        null,
      );
    });
  });
});

test('SHOW_WHEN_LOW continues to suppress normal stock and missing thresholds', () => {
  flagNames.forEach((name) => {
    process.env[name] = 'true';
  });

  const overrides = { stockLevelDisplay: 'SHOW_WHEN_LOW' };

  assert.equal(display(inventory(5), overrides).stockLevelMessage, 'ONLY 5 IN STOCK');
  assert.equal(display(inventory(6), overrides), null);
  assert.equal(display(inventory(1, 0), overrides), null);
});

test('missing inventory, untracked/variant quantities, and out-of-stock behavior are preserved', () => {
  assert.equal(display(null), null);
  assert.equal(getStockDisplayData(inventory(5), null, formatStock), null);
  assert.equal(display({ isInStock: true }), null);
  assert.equal(display(inventory(0)), null);
  assert.deepEqual(display({ isInStock: false }), {
    stockLevelMessage: 'Sold out',
    backorderAvailabilityPrompt: null,
  });
  assert.equal(display({ isInStock: false }, { showOutOfStockMessage: false }), null);
});

test('backorders use physical stock and retain the availability prompt and zero-stock text', () => {
  flagNames.forEach((name) => {
    process.env[name] = 'true';
  });

  const stock = inventory(100);

  stock.aggregated.availableOnHand = 3;
  stock.aggregated.unlimitedBackorder = true;

  const overrides = { showBackorderAvailabilityPrompt: true };

  assert.deepEqual(display(stock, overrides), {
    stockLevelMessage: 'ONLY 3 IN STOCK',
    stockLevelStatus: 'error',
    backorderAvailabilityPrompt: 'Available on backorder',
  });
  stock.aggregated.availableOnHand = 0;
  assert.deepEqual(display(stock, overrides), {
    stockLevelMessage: 'Current stock: 0',
    backorderAvailabilityPrompt: 'Available on backorder',
  });
});

test('absent flags preserve the existing stock text and neutral state', () => {
  [3, 10].forEach((quantity) => {
    assert.deepEqual(display(inventory(quantity)), {
      stockLevelMessage: `Current stock: ${quantity}`,
      backorderAvailabilityPrompt: null,
    });
  });
});

test('blank and non-true values do not enable either behavior', () => {
  ['', 'false', 'TRUE', '1', 'yes'].forEach((value) => {
    flagNames.forEach((name) => {
      process.env[name] = value;
    });
    [3, 10].forEach((quantity) => {
      assert.deepEqual(display(inventory(quantity)), {
        stockLevelMessage: `Current stock: ${quantity}`,
        backorderAvailabilityPrompt: null,
      });
    });
  });
});
