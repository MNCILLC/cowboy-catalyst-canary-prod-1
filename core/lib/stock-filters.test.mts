import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getAppliedFilters,
  removeAppliedFilter,
} from '../vibes/soul/sections/products-list-section/applied-filters-state.ts';

import {
  matchesMetafieldSelections,
  paginateMetafieldMatches,
} from './product-metafield-filters.ts';
import { isAvailableToShip, parseStockFilters } from './stock-filters.ts';

test('stock URLs support either option, both options, repeated and comma-separated values', () => {
  assert.deepEqual(parseStockFilters('in_stock'), ['in_stock']);
  assert.deepEqual(parseStockFilters('available_to_ship'), ['available_to_ship']);
  assert.deepEqual(parseStockFilters('in_stock,available_to_ship'), [
    'in_stock',
    'available_to_ship',
  ]);
  assert.deepEqual(parseStockFilters(['in_stock,available_to_ship', 'available_to_ship']), [
    'in_stock',
    'available_to_ship',
  ]);
  for (const value of [null, undefined, '', 'unknown', ['unknown', 1]]) {
    assert.deepEqual(parseStockFilters(value), []);
  }
});

test('shipping requires on-hand stock even when BigCommerce allows backorders', () => {
  const backorderInventory = {
    isInStock: true,
    aggregated: { availableOnHand: 0, availableToSell: 100, unlimitedBackorder: true },
  };
  assert.equal(isAvailableToShip(backorderInventory), false);
  assert.equal(
    isAvailableToShip({
      ...backorderInventory,
      aggregated: { ...backorderInventory.aggregated, availableOnHand: 3 },
    }),
    true,
  );
  assert.equal(isAvailableToShip({ isInStock: false, aggregated: { availableOnHand: 3 } }), false);
  assert.equal(isAvailableToShip({ isInStock: true, aggregated: { availableOnHand: -2 } }), false);
  assert.equal(isAvailableToShip({ isInStock: true, aggregated: null }), false);
  assert.equal(isAvailableToShip({ isInStock: true }), false);
  assert.equal(isAvailableToShip(null), false);
  assert.equal(isAvailableToShip(undefined), false);
});

test('on-hand matching composes with custom filters before counting and paginating', () => {
  // Most of the first upstream page is backorder-only. Later matches still fill the page.
  const products = Array.from({ length: 120 }, (_, i) => ({
    entityId: i + 1,
    inventory: { isInStock: true, aggregated: { availableOnHand: i % 4 === 0 ? 2 : 0 } },
    metafields: [{ key: 'colors', value: i % 3 === 0 ? '["red"]' : '["blue"]' }],
  }));
  const ids = products
    .filter((product) => isAvailableToShip(product.inventory))
    .filter((product) =>
      matchesMetafieldSelections(product.metafields, [{ key: 'colors', values: ['red'] }]),
    )
    .map((product) => product.entityId);
  const first = paginateMetafieldMatches(ids, { limit: 9 });
  assert.deepEqual(first.ids, [1, 13, 25, 37, 49, 61, 73, 85, 97]);
  assert.equal(first.collectionInfo.totalItems, 10);
  assert.equal(first.pageInfo.hasNextPage, true);
  const last = paginateMetafieldMatches(ids, { after: first.pageInfo.endCursor, limit: 9 });
  assert.deepEqual(last.ids, [109]);
  assert.equal(last.pageInfo.hasNextPage, false);
  assert.deepEqual(
    paginateMetafieldMatches(ids, { before: last.pageInfo.startCursor, limit: 9 }).ids,
    first.ids,
  );
  assert.equal(paginateMetafieldMatches([], {}).collectionInfo.totalItems, 0);
});

test('Available to Ship has a removable applied filter and removal resets pagination', () => {
  const filters = [
    {
      type: 'toggle-group',
      paramName: 'stock',
      label: 'In stock',
      options: [
        { value: 'in_stock', label: 'In stock' },
        { value: 'available_to_ship', label: 'Available to Ship' },
      ],
    },
  ];
  const params = { stock: ['in_stock', 'available_to_ship'], after: 'mf:8' };
  const chips = getAppliedFilters(filters, params);
  assert.deepEqual(
    chips.map(({ valueLabel }) => valueLabel),
    ['In stock', 'Available to Ship'],
  );
  assert.deepEqual(removeAppliedFilter(chips[1], params), {
    stock: ['in_stock'],
    before: null,
    after: null,
  });
});
