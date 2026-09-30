import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearAppliedFilters,
  getAppliedFilters,
  removeAppliedFilter,
} from '../vibes/soul/sections/products-list-section/applied-filters-state.ts';

const filters = [
  {
    type: 'checkbox-group',
    paramName: 'mf_colors',
    label: 'Colors',
    options: [
      { value: 'blue', label: 'Blue' },
      { value: 'red', label: 'Red', disabled: true },
    ],
  },
  {
    type: 'checkbox-group',
    paramName: 'mf_duration',
    label: 'Duration',
    options: [{ value: 'medium', label: 'Medium (10–30 sec)' }],
  },
  {
    type: 'toggle-group',
    paramName: 'brand',
    label: 'Brand',
    options: [{ value: '1', label: 'OFO (12)', appliedLabel: 'OFO' }],
  },
  {
    type: 'range',
    label: 'Price',
    minParamName: 'minPrice',
    maxParamName: 'maxPrice',
    min: 5,
    max: 500,
  },
  { type: 'rating', paramName: 'minRating', label: 'Rating' },
  { type: 'link-group', label: 'Categories', links: [{ label: 'Shop all', href: '/shop-all' }] },
];

test('one labeled chip per selected value, including disabled values and ranges', () => {
  const chips = getAppliedFilters(filters, {
    mf_colors: ['blue', 'red'],
    mf_duration: ['medium'],
    brand: ['1'],
    minPrice: 0,
    maxPrice: 100,
    minRating: ['4'],
    sort: 'newest',
    term: 'fireworks',
    compare: ['12'],
  });
  assert.deepEqual(
    chips.map(({ label, valueLabel }) => [label, valueLabel]),
    [
      ['Colors', 'Blue'],
      ['Colors', 'Red'],
      ['Duration', 'Medium (10–30 sec)'],
      ['Brand', 'OFO'],
      ['Price', '0 – 100'],
      ['Rating', '4 ★'],
    ],
  );
  assert.equal(new Set(chips.map(({ id }) => id)).size, chips.length);
});

test('empty/default filters have no chips, but unknown selected options remain removable', () => {
  assert.deepEqual(getAppliedFilters(filters, {}), []);
  assert.deepEqual(
    getAppliedFilters(filters, { mf_colors: [], minPrice: null, maxPrice: null }),
    [],
  );
  const [chip] = getAppliedFilters(filters, { mf_colors: ['unknown', 'unknown'] });
  assert.equal(chip.valueLabel, 'unknown');
  assert.deepEqual(removeAppliedFilter(chip, { mf_colors: ['unknown'] }), {
    before: null,
    after: null,
    mf_colors: null,
  });
});

test('removing one chip preserves other selected options and unrelated URL state', () => {
  const params = {
    mf_colors: ['blue', 'red'],
    mf_duration: ['medium'],
    term: 'fireworks',
    sort: 'newest',
    compare: ['12'],
    limit: 9,
    after: 'mf:8',
  };
  const [chip] = getAppliedFilters(filters, params);
  const update = removeAppliedFilter(chip, params);
  assert.deepEqual(update, { mf_colors: ['red'], before: null, after: null });
  assert.deepEqual(
    { ...params, ...update },
    { ...params, mf_colors: ['red'], before: null, after: null },
  );
  assert.deepEqual(params.mf_colors, ['blue', 'red']);
  // A second click uses the current state, so it cannot restore an option removed by the first click.
  const second = getAppliedFilters(filters, params)[1];
  assert.deepEqual(removeAppliedFilter(second, { ...params, ...update }), {
    mf_colors: null,
    before: null,
    after: null,
  });
});

test('removing price clears both bounds, preserves zero, and respects custom cursor names', () => {
  const [chip] = getAppliedFilters(filters, { minPrice: 0, maxPrice: 100 }, (n) => `$${n}`);
  assert.equal(chip.valueLabel, '$0 – $100');
  assert.deepEqual(
    removeAppliedFilter(chip, { minPrice: 0, maxPrice: 100, mf_colors: ['blue'] }, [
      'previous',
      'next',
    ]),
    {
      minPrice: null,
      maxPrice: null,
      previous: null,
      next: null,
    },
  );
  assert.equal(getAppliedFilters(filters, { minPrice: 100 })[0].valueLabel, '≥ 100');
  assert.equal(getAppliedFilters(filters, { maxPrice: 0 })[0].valueLabel, '≤ 0');
  assert.deepEqual(getAppliedFilters(filters, { minPrice: NaN, maxPrice: Infinity }), []);
});

test('clear all clears only filter and pagination parameters', () => {
  const clear = clearAppliedFilters(filters);
  assert.deepEqual(clear, {
    mf_colors: null,
    mf_duration: null,
    brand: null,
    minPrice: null,
    maxPrice: null,
    minRating: null,
    before: null,
    after: null,
  });
  const unrelated = { term: 'fireworks', sort: 'newest', compare: ['12'], limit: 9 };
  for (const [key, value] of Object.entries(unrelated)) {
    assert.deepEqual({ ...unrelated, ...clear }[key], value);
  }
});
