import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getMetafieldSelections,
  getProductAttributes,
  matchesMetafieldSelections,
  paginateMetafieldMatches,
  parseAttributeValues,
  parseFilterOptions,
  parseNumericAttribute,
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

test('card attributes resolve labels and swatches, retain unknown values, and ignore malformed or empty groups', () => {
  assert.deepEqual(
    getProductAttributes(
      [
        { key: 'colors', value: '["dark-green","dark-green","unknown",""]' },
        { key: 'effects', value: 'invalid' },
        { key: 'duration', value: '[]' },
        { key: 'unrelated', value: '["hidden"]' },
      ],
      [
        {
          paramName: 'mf_colors',
          label: 'Colors',
          options: [{ value: 'dark-green', label: 'Dark Green', swatchColor: '#006400' }],
        },
        { paramName: 'mf_effects', label: 'Effects', options: [] },
        { paramName: 'mf_duration', label: 'Duration', options: [] },
      ],
    ),
    [
      {
        key: 'colors',
        label: 'Colors',
        values: [
          { value: 'dark-green', label: 'Dark Green', swatchColor: '#006400' },
          { value: 'unknown', label: 'unknown' },
        ],
      },
    ],
  );
  assert.deepEqual(getProductAttributes([], []), []);
});

const durationFilters = [
  {
    paramName: 'mf_duration',
    label: 'Duration',
    options: parseFilterOptions(
      JSON.stringify([
        { label: 'Short', value: 'short', min: 1, max: 10 },
        { label: 'Medium', value: 'medium', min: 10, max: 30 },
        { label: 'Long', value: 'long', min: 30, max: 100 },
        { label: 'Over 300', value: 'over-300', min: 301, max: null },
      ]),
    ),
  },
];

function matchesDuration(value: string, selected: string[]) {
  return matchesMetafieldSelections(
    [{ key: 'duration', value }],
    [{ key: 'duration', values: selected }],
    durationFilters,
  );
}

test('duration ranges use numeric inclusive bounds and a null upper bound', () => {
  for (const seconds of [10, 20, 30]) {
    assert.equal(matchesDuration(String(seconds), ['medium']), true);
  }
  for (const seconds of [0, 9, 31, 300]) {
    assert.equal(matchesDuration(String(seconds), ['medium']), false);
  }
  assert.equal(matchesDuration('10', ['short']), true);
  assert.equal(matchesDuration('30', ['long']), true);
  assert.equal(matchesDuration('300', ['over-300']), false);
  assert.equal(matchesDuration('301', ['over-300']), true);
  assert.equal(matchesDuration('100000', ['over-300']), true);
});

test('selected duration ranges are ORed and combine with other attributes using AND', () => {
  for (const seconds of [5, 10, 20, 30]) {
    assert.equal(matchesDuration(String(seconds), ['short', 'medium']), true);
  }
  assert.equal(matchesDuration('31', ['short', 'medium']), false);
  const fields = [
    { key: 'duration', value: '15' },
    { key: 'colors', value: '["red"]' },
  ];
  assert.equal(
    matchesMetafieldSelections(
      fields,
      [
        { key: 'duration', values: ['short', 'medium'] },
        { key: 'colors', values: ['red', 'blue'] },
      ],
      durationFilters,
    ),
    true,
  );
  assert.equal(
    matchesMetafieldSelections(
      fields,
      [
        { key: 'duration', values: ['medium'] },
        { key: 'colors', values: ['blue'] },
      ],
      durationFilters,
    ),
    false,
  );
  assert.equal(
    matchesMetafieldSelections(
      fields,
      [
        { key: 'duration', values: ['short'] },
        { key: 'colors', values: ['red'] },
      ],
      durationFilters,
    ),
    false,
  );
});

test('invalid numeric data, unknown selections, and missing bounds do not match', () => {
  for (const value of [
    '',
    ' ',
    'null',
    'true',
    '[]',
    '[15]',
    '"15"',
    '{}',
    'NaN',
    'Infinity',
    '1e400',
    '-1',
    '["medium"]',
  ]) {
    assert.equal(parseNumericAttribute(value), undefined);
    assert.equal(matchesDuration(value, ['short', 'medium', 'over-300']), false);
  }
  assert.equal(parseNumericAttribute(undefined), undefined);
  assert.equal(parseNumericAttribute('0'), 0);
  assert.equal(parseNumericAttribute('15'), 15);
  assert.equal(matchesDuration('15', ['missing']), false);
  assert.equal(
    matchesMetafieldSelections([], [{ key: 'duration', values: ['medium'] }], durationFilters),
    false,
  );
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'durations', value: '["medium"]' }],
      [{ key: 'duration', values: ['medium'] }],
      durationFilters,
    ),
    false,
  );
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'duration', value: '15' }],
      [{ key: 'duration', values: ['medium'] }],
    ),
    false,
  );
  for (const bounds of [
    {},
    { min: 1 },
    { min: null, max: 30 },
    { min: '1', max: 30 },
    { min: -1, max: 30 },
    { min: 30, max: 10 },
  ]) {
    const options = parseFilterOptions(
      JSON.stringify([{ label: 'Medium', value: 'medium', ...bounds }]),
    );
    assert.equal(
      matchesMetafieldSelections(
        [{ key: 'duration', value: '15' }],
        [{ key: 'duration', values: ['medium'] }],
        [{ ...durationFilters[0], options }],
      ),
      false,
    );
  }
});

test('range matching follows site metadata rather than the option slug or label', () => {
  const options = parseFilterOptions(
    '[{"label":"Custom label","value":"arbitrary-slug","min":12,"max":17}]',
  );
  assert.deepEqual(options, [{ label: 'Custom label', value: 'arbitrary-slug', min: 12, max: 17 }]);
  for (const [value, expected] of [
    ['11', false],
    ['12', true],
    ['17', true],
    ['18', false],
  ]) {
    assert.equal(
      matchesMetafieldSelections(
        [{ key: 'duration', value }],
        [{ key: 'duration', values: ['arbitrary-slug'] }],
        [{ ...durationFilters[0], options }],
      ),
      expected,
    );
  }
});

test('numeric durations render as seconds with a singular label, and invalid data stays hidden', () => {
  assert.deepEqual(getProductAttributes([{ key: 'duration', value: '12' }], durationFilters), [
    { key: 'duration', label: 'Duration', values: [{ value: '12', label: '12 sec' }] },
  ]);
  assert.deepEqual(getProductAttributes([{ key: 'duration', value: '0' }], durationFilters), [
    { key: 'duration', label: 'Duration', values: [{ value: '0', label: '0 sec' }] },
  ]);
  for (const value of ['[12]', '"12"', 'invalid', 'null', '-1']) {
    assert.deepEqual(getProductAttributes([{ key: 'duration', value }], durationFilters), []);
  }
});
