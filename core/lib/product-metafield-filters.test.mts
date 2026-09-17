import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getMetafieldSelections,
  matchesMetafieldSelections,
  paginateMetafieldMatches,
  parseAttributeValues,
  parseFilterOptions,
  productFilterDefinitions,
} from './product-metafield-filters.ts';

test('OR within a selected group and AND between groups', () => {
  const attributes = [
    { key: 'colors', value: '["red","white"]' },
    { key: 'effects', value: '["comet"]' },
  ];
  assert.equal(
    matchesMetafieldSelections(attributes, [{ key: 'colors', values: ['blue', 'red'] }]),
    true,
  );
  assert.equal(
    matchesMetafieldSelections(attributes, [
      { key: 'colors', values: ['red'] },
      { key: 'effects', values: ['comet', 'willow'] },
    ]),
    true,
  );
  assert.equal(
    matchesMetafieldSelections(attributes, [
      { key: 'colors', values: ['red'] },
      { key: 'effects', values: ['willow'] },
    ]),
    false,
  );
  assert.equal(matchesMetafieldSelections(attributes, []), true);
  assert.equal(matchesMetafieldSelections(attributes, [{ key: 'colors', values: ['re'] }]), false);
});

test('missing, malformed, and non-list attributes cannot satisfy a selection', () => {
  for (const value of ['invalid', 'null', '{}', '"red"', '[1,null]']) {
    assert.equal(
      matchesMetafieldSelections([{ key: 'colors', value }], [{ key: 'colors', values: ['red'] }]),
      false,
    );
  }
  assert.equal(matchesMetafieldSelections([], [{ key: 'colors', values: ['red'] }]), false);
  assert.deepEqual(parseAttributeValues('["red",1,null]'), ['red']);
});

test('all seven URL parameters accept comma lists and repeated parameters, ignoring unrelated fields', () => {
  for (const { productKey } of productFilterDefinitions) {
    assert.deepEqual(
      getMetafieldSelections({
        [`mf_${productKey}`]: ['red,blue', 'red'],
        sort: 'newest',
        mf_unknown: 'x',
      }),
      [{ key: productKey, values: ['red', 'blue'] }],
    );
  }
  assert.deepEqual(getMetafieldSelections({ mf_colors: null, mf_effects: '' }), []);
});

test('option parsing preserves labels and slugs, skips malformed entries and duplicates', () => {
  assert.deepEqual(
    parseFilterOptions(
      '[{"label":"Red","value":"red","color_value":"#ff0000"},{"label":"Repeat","value":"red"},null,{"value":3},{"label":"","value":"x"}]',
    ),
    [{ label: 'Red', value: 'red' }],
  );
  assert.deepEqual(parseFilterOptions('invalid'), []);
  assert.deepEqual(parseFilterOptions('{}'), []);
});

test('pagination uses the entire matching set and supports forwards, backwards and last page', () => {
  const ids = Array.from({ length: 25 }, (_, i) => i + 1);
  const first = paginateMetafieldMatches(ids, {});
  const second = paginateMetafieldMatches(ids, { after: first.pageInfo.endCursor });
  const third = paginateMetafieldMatches(ids, { after: second.pageInfo.endCursor });
  assert.deepEqual(first.ids, ids.slice(0, 9));
  assert.deepEqual(second.ids, ids.slice(9, 18));
  assert.deepEqual(third.ids, ids.slice(18));
  assert.equal(third.pageInfo.hasNextPage, false);
  assert.equal(first.collectionInfo.totalItems, 25);
  assert.deepEqual(
    paginateMetafieldMatches(ids, { before: third.pageInfo.startCursor }).ids,
    second.ids,
  );
  assert.deepEqual(
    paginateMetafieldMatches(ids, { before: second.pageInfo.startCursor }).ids,
    first.ids,
  );
});

test('empty results and stale/invalid cursors stay valid and bounded', () => {
  const empty = paginateMetafieldMatches([], { after: 'mf:100' });
  assert.deepEqual(empty.ids, []);
  assert.equal(empty.pageInfo.hasNextPage, false);
  assert.equal(empty.pageInfo.hasPreviousPage, false);
  assert.equal(empty.pageInfo.startCursor, null);
  assert.deepEqual(paginateMetafieldMatches([1, 2], { after: 'upstream-cursor' }).ids, [1, 2]);
  assert.deepEqual(paginateMetafieldMatches([1, 2], { after: 'mf:100' }).ids, [1, 2]);
  assert.equal(
    paginateMetafieldMatches(
      Array.from({ length: 100 }, (_, i) => i),
      { limit: 1000 },
    ).ids.length,
    50,
  );
});
