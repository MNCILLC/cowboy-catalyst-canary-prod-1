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

test('all attribute URL parameters accept comma lists and repeated parameters, ignoring unrelated fields', () => {
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

const heightFilters = [
  {
    paramName: 'mf_performance_height',
    label: 'Height',
    options: parseFilterOptions(
      JSON.stringify([
        { label: '0 - 100 ft', value: '0-100-ft', min: 0, max: 100 },
        { label: '101 - 150 ft', value: '101-150-ft', min: 101, max: 150 },
        { label: '151 - 200 ft', value: '151-200-ft', min: 151, max: 200 },
        { label: '201 - 250 ft', value: '201-250-ft', min: 201, max: 250 },
        { label: '251 - 300 ft', value: '251-300-ft', min: 251, max: 300 },
        { label: '301+ ft', value: '301-plus-ft', min: 301, max: null },
      ]),
    ),
  },
];

function matchesHeight(value: string, selected: string[]) {
  return matchesMetafieldSelections(
    [{ key: 'performance_height', value }],
    [{ key: 'performance_height', values: selected }],
    heightFilters,
  );
}

test('all height ranges use inclusive numeric bounds, including the open-ended 301+ range', () => {
  for (const option of heightFilters[0].options) {
    assert.equal(matchesHeight(String(option.min), [option.value]), true);
    assert.equal(matchesHeight(String(option.min - 1), [option.value]), false);
    if (option.max !== null) {
      assert.equal(matchesHeight(String(option.max), [option.value]), true);
      assert.equal(matchesHeight(String(option.max + 1), [option.value]), false);
    }
  }
  assert.equal(matchesHeight('350', ['301-plus-ft']), true);
  assert.equal(matchesHeight('5000', ['301-plus-ft']), true);
  assert.equal(matchesHeight('150', ['101-150-ft']), true);
  assert.equal(matchesHeight('150', ['151-200-ft']), false);
});

test('height ranges are ORed and combine with duration and list attributes using AND', () => {
  for (const height of [101, 150, 151, 200]) {
    assert.equal(matchesHeight(String(height), ['101-150-ft', '151-200-ft']), true);
  }
  assert.equal(matchesHeight('201', ['101-150-ft', '151-200-ft']), false);
  const fields = [
    { key: 'performance_height', value: '175' },
    { key: 'duration', value: '20' },
    { key: 'colors', value: '["blue"]' },
  ];
  const selected = [
    { key: 'performance_height', values: ['101-150-ft', '151-200-ft'] },
    { key: 'duration', values: ['medium'] },
    { key: 'colors', values: ['blue', 'red'] },
  ];
  assert.equal(
    matchesMetafieldSelections(fields, selected, [...heightFilters, ...durationFilters]),
    true,
  );
  for (const key of ['performance_height', 'duration', 'colors']) {
    const mismatch = fields.map((field) =>
      field.key === key ? { ...field, value: key === 'colors' ? '["green"]' : '500' } : field,
    );
    assert.equal(
      matchesMetafieldSelections(mismatch, selected, [...heightFilters, ...durationFilters]),
      false,
    );
  }
});

test('invalid, missing, and legacy height data do not match numeric ranges', () => {
  for (const value of ['[175]', '"175"', '["151-200-ft"]', '', 'null', '-1', 'true']) {
    assert.equal(matchesHeight(value, ['151-200-ft']), false);
    assert.deepEqual(
      getProductAttributes([{ key: 'performance_height', value }], heightFilters),
      [],
    );
  }
  assert.equal(
    matchesMetafieldSelections(
      [],
      [{ key: 'performance_height', values: ['151-200-ft'] }],
      heightFilters,
    ),
    false,
  );
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'performance_heights', value: '["151-200-ft"]' }],
      [{ key: 'performance_height', values: ['151-200-ft'] }],
      heightFilters,
    ),
    false,
  );
  assert.equal(matchesHeight('175', ['unknown']), false);
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'performance_height', value: '175' }],
      [{ key: 'performance_height', values: ['151-200-ft'] }],
      [{ ...heightFilters[0], options: [{ value: '151-200-ft', label: 'Missing bounds' }] }],
    ),
    false,
  );
});

test('cards display Height in feet while keeping Duration in seconds', () => {
  assert.deepEqual(
    getProductAttributes(
      [
        { key: 'performance_height', value: '175' },
        { key: 'duration', value: '20' },
      ],
      [...heightFilters, ...durationFilters],
    ),
    [
      { key: 'performance_height', label: 'Height', values: [{ value: '175', label: '175 ft' }] },
      { key: 'duration', label: 'Duration', values: [{ value: '20', label: '20 sec' }] },
    ],
  );
  assert.deepEqual(
    getProductAttributes([{ key: 'performance_height', value: '0' }], heightFilters),
    [{ key: 'performance_height', label: 'Height', values: [{ value: '0', label: '0 ft' }] }],
  );
});

const caliberFilters = [
  {
    paramName: 'mf_caliber',
    label: 'Caliber',
    options: parseFilterOptions(
      JSON.stringify([
        { label: '20 mm or less', value: '20-mm-or-less', min: 0, max: 20 },
        ...[22, 25, 30, 38, 40, 45, 50].map((size) => ({
          label: `${size} mm`,
          value: `${size}-mm`,
          min: size,
          max: size,
        })),
        { label: '50+ mm', value: '50-plus-mm', min: 50, max: null },
      ]),
    ),
  },
];

function matchesCaliber(value: string, selected: string[]) {
  return matchesMetafieldSelections(
    [{ key: 'caliber', value }],
    [{ key: 'caliber', values: selected }],
    caliberFilters,
  );
}

test('caliber matches exact sizes and inclusive lower and open-ended ranges', () => {
  for (const size of [22, 25, 30, 38, 40, 45, 50]) {
    assert.equal(matchesCaliber(String(size), [`${size}-mm`]), true);
    assert.equal(matchesCaliber(String(size - 1), [`${size}-mm`]), false);
    assert.equal(matchesCaliber(String(size + 1), [`${size}-mm`]), false);
  }
  for (const size of [0, 10, 20])
    assert.equal(matchesCaliber(String(size), ['20-mm-or-less']), true);
  assert.equal(matchesCaliber('21', ['20-mm-or-less']), false);
  assert.equal(matchesCaliber('49', ['50-plus-mm']), false);
  for (const size of [50, 60, 100])
    assert.equal(matchesCaliber(String(size), ['50-plus-mm']), true);
  assert.equal(
    matchesCaliber(
      '23',
      caliberFilters[0].options.map(({ value }) => value),
    ),
    false,
  );
});

test('caliber options are ORed and combine with height, duration and colors using AND', () => {
  for (const size of [22, 25]) assert.equal(matchesCaliber(String(size), ['22-mm', '25-mm']), true);
  assert.equal(matchesCaliber('24', ['22-mm', '25-mm']), false);
  const fields = [
    { key: 'caliber', value: '25' },
    { key: 'performance_height', value: '175' },
    { key: 'duration', value: '20' },
    { key: 'colors', value: '["red"]' },
  ];
  const selections = [
    { key: 'caliber', values: ['22-mm', '25-mm'] },
    { key: 'performance_height', values: ['151-200-ft'] },
    { key: 'duration', values: ['medium'] },
    { key: 'colors', values: ['red'] },
  ];
  const filters = [...caliberFilters, ...heightFilters, ...durationFilters];
  assert.equal(matchesMetafieldSelections(fields, selections, filters), true);
  for (const key of ['caliber', 'performance_height', 'duration', 'colors']) {
    const mismatch = fields.map((field) =>
      field.key === key ? { ...field, value: key === 'colors' ? '["green"]' : '999' } : field,
    );
    assert.equal(matchesMetafieldSelections(mismatch, selections, filters), false);
  }
});

test('caliber rejects missing, legacy, and invalid values and requires site range bounds', () => {
  for (const value of ['[25]', '"25"', '["25-mm"]', '', 'null', '-1', 'true']) {
    assert.equal(matchesCaliber(value, ['25-mm']), false);
    assert.deepEqual(getProductAttributes([{ key: 'caliber', value }], caliberFilters), []);
  }
  const selections = [{ key: 'caliber', values: ['25-mm'] }];
  assert.equal(matchesMetafieldSelections([], selections, caliberFilters), false);
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'calibers', value: '["25-mm"]' }],
      selections,
      caliberFilters,
    ),
    false,
  );
  assert.equal(matchesCaliber('25', ['missing']), false);
  assert.equal(
    matchesMetafieldSelections([{ key: 'caliber', value: '25' }], selections, [
      { ...caliberFilters[0], options: [{ value: '25-mm', label: 'Missing bounds' }] },
    ]),
    false,
  );
  const customFilters = [
    {
      ...caliberFilters[0],
      options: [{ value: '25-mm', label: 'Changed range', min: 24, max: 26 }],
    },
  ];
  for (const value of ['24', '25', '26']) {
    assert.equal(
      matchesMetafieldSelections([{ key: 'caliber', value }], selections, customFilters),
      true,
    );
  }
});

test('cards display Caliber in mm, Height in ft, and Duration in sec', () => {
  assert.deepEqual(
    getProductAttributes(
      [
        { key: 'caliber', value: '25' },
        { key: 'performance_height', value: '175' },
        { key: 'duration', value: '20' },
      ],
      [...caliberFilters, ...heightFilters, ...durationFilters],
    ),
    [
      { key: 'caliber', label: 'Caliber', values: [{ value: '25', label: '25 mm' }] },
      { key: 'performance_height', label: 'Height', values: [{ value: '175', label: '175 ft' }] },
      { key: 'duration', label: 'Duration', values: [{ value: '20', label: '20 sec' }] },
    ],
  );
});

test('colors match site values regardless of capitalization or surrounding whitespace', () => {
  const fields = [{ key: 'colors', value: '["gold","silver"]' }];

  for (const values of [['Gold'], ['Silver'], ['Gold', 'Silver'], [' GOLD ', 'Blue']]) {
    assert.equal(matchesMetafieldSelections(fields, [{ key: 'colors', values }]), true);
  }
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'colors', value: '[" Gold ","SILVER"]' }],
      [{ key: 'colors', values: ['gold'] }],
    ),
    true,
  );
  for (const values of [['Blue'], ['Gol'], ['Gold/Silver']]) {
    assert.equal(matchesMetafieldSelections(fields, [{ key: 'colors', values }]), false);
  }
  assert.equal(
    matchesMetafieldSelections(fields, [
      { key: 'colors', values: ['Gold'] },
      { key: 'effects', values: ['Willow'] },
    ]),
    false,
  );
});

test('lowercase product colors resolve the configured labels and swatches without changing option values', () => {
  const options = parseFilterOptions(
    '[{"label":"Gold","value":"Gold","hex_value":"#FFD700"},{"label":"Silver","value":"Silver","hex_value":"#C0C0C0"}]',
    true,
  );

  assert.deepEqual(
    getProductAttributes(
      [{ key: 'colors', value: '["gold"," SILVER "]' }],
      [{ paramName: 'mf_colors', label: 'Colors', options }],
    ),
    [{ key: 'colors', label: 'Colors', values: options }],
  );
  assert.deepEqual(
    options.map(({ value }) => value),
    ['Gold', 'Silver'],
  );
});

const shotCountFilters = [
  {
    paramName: 'mf_shot_count',
    label: 'Shot Count',
    options: parseFilterOptions(
      JSON.stringify([
        { label: '1–25 shots', value: 'small', min: 1, max: 25 },
        { label: '26–50 shots', value: 'medium', min: 26, max: 50 },
        { label: '51+ shots', value: 'large', min: 51, max: null },
      ]),
    ),
  },
];

function matchesShotCount(value: string, selected: string[]) {
  return matchesMetafieldSelections(
    [{ key: 'shot_count', value }],
    [{ key: 'shot_count', values: selected }],
    shotCountFilters,
  );
}

test('shot count uses inclusive configured ranges and an open-ended maximum', () => {
  for (const [value, selected, expected] of [
    ['0', 'small', false],
    ['1', 'small', true],
    ['25', 'small', true],
    ['26', 'small', false],
    ['25', 'medium', false],
    ['26', 'medium', true],
    ['50', 'medium', true],
    ['51', 'medium', false],
    ['50', 'large', false],
    ['51', 'large', true],
    ['1000', 'large', true],
  ] as const) {
    assert.equal(matchesShotCount(value, [selected]), expected);
  }
  const options = [{ label: 'Custom range', value: 'custom', min: 70, max: 80 }];
  assert.equal(
    matchesMetafieldSelections(
      [{ key: 'shot_count', value: '75' }],
      [{ key: 'shot_count', values: ['custom'] }],
      [{ ...shotCountFilters[0], options }],
    ),
    true,
  );
});

test('shot count selections use OR within ranges and AND with other attributes', () => {
  assert.equal(matchesShotCount('25', ['small', 'medium']), true);
  assert.equal(matchesShotCount('50', ['small', 'medium']), true);
  assert.equal(matchesShotCount('51', ['small', 'medium']), false);
  const fields = [
    { key: 'shot_count', value: '30' },
    { key: 'colors', value: '["gold"]' },
  ];
  const selections = getMetafieldSelections({ mf_shot_count: ['small,medium'], mf_colors: 'Gold' });
  assert.equal(matchesMetafieldSelections(fields, selections, shotCountFilters), true);
  assert.equal(matchesMetafieldSelections(fields.slice(0, 1), selections, shotCountFilters), false);
  assert.equal(matchesMetafieldSelections(fields.slice(1), selections, shotCountFilters), false);
});

test('missing or invalid shot counts and unconfigured ranges do not match', () => {
  for (const value of ['', 'null', 'true', '-1', '"30"', '[30]', '["medium"]', '{}', '1e400']) {
    assert.equal(matchesShotCount(value, ['small', 'medium', 'large']), false);
    assert.deepEqual(getProductAttributes([{ key: 'shot_count', value }], shotCountFilters), []);
  }
  assert.equal(matchesShotCount('30', ['unknown']), false);
  const fields = [{ key: 'shot_count', value: '30' }];
  const selections = [{ key: 'shot_count', values: ['medium'] }];
  assert.equal(matchesMetafieldSelections(fields, selections), false);
  assert.equal(
    matchesMetafieldSelections(fields, selections, [
      {
        ...shotCountFilters[0],
        options: [{ label: 'Missing bounds', value: 'medium' }],
      },
    ]),
    false,
  );
});

test('PDP and PLP attributes display the numeric shot count even without configured ranges', () => {
  for (const value of ['0', '1', '30', '1000']) {
    for (const options of [shotCountFilters[0].options, []]) {
      assert.deepEqual(
        getProductAttributes([{ key: 'shot_count', value }], [{ ...shotCountFilters[0], options }]),
        [{ key: 'shot_count', label: 'Shot Count', values: [{ value, label: value }] }],
      );
    }
  }
  assert.deepEqual(getProductAttributes([], shotCountFilters), []);
});

const spreadFilters = [
  {
    paramName: 'mf_spreads',
    label: 'Firing Angles',
    options: parseFilterOptions(
      '[{"label":"W angle","value":"spread-w"},{"label":"Fan","value":"spread-fan"}]',
    ),
  },
];

test('firing angles support repeated and comma-separated selections with OR within and AND across groups', () => {
  assert.ok(
    productFilterDefinitions.some(
      ({ siteKey, productKey }) => siteKey === 'spread_filters' && productKey === 'spreads',
    ),
  );
  const selections = getMetafieldSelections({
    mf_spreads: ['spread-v,spread-w', 'spread-w'],
    mf_colors: 'gold',
  });
  assert.deepEqual(selections, [
    { key: 'colors', values: ['gold'] },
    { key: 'spreads', values: ['spread-v', 'spread-w'] },
  ]);
  const fields = [
    { key: 'spreads', value: '["spread-w","spread-fan"]' },
    { key: 'colors', value: '["gold"]' },
  ];
  assert.equal(matchesMetafieldSelections(fields, selections, spreadFilters), true);
  assert.equal(matchesMetafieldSelections(fields.slice(0, 1), selections, spreadFilters), false);
  assert.equal(matchesMetafieldSelections(fields.slice(1), selections, spreadFilters), false);
  assert.equal(
    matchesMetafieldSelections(fields, [{ key: 'spreads', values: ['spread-i'] }]),
    false,
  );
});

test('firing angle attributes preserve SVG filenames and configured labels, including unconfigured values', () => {
  assert.deepEqual(
    getProductAttributes(
      [{ key: 'spreads', value: '["spread-w","spread-fan","spread-w","spread-i"]' }],
      spreadFilters,
    ),
    [
      {
        key: 'spreads',
        label: 'Firing Angles',
        values: [
          { value: 'spread-w', label: 'W angle' },
          { value: 'spread-fan', label: 'Fan' },
          { value: 'spread-i', label: 'spread-i' },
        ],
      },
    ],
  );
  assert.deepEqual(
    getProductAttributes(
      [{ key: 'spreads', value: '["spread-w"]' }],
      [{ ...spreadFilters[0], options: [] }],
    ),
    [
      {
        key: 'spreads',
        label: 'Firing Angles',
        values: [{ value: 'spread-w', label: 'spread-w' }],
      },
    ],
  );
});

test('missing, empty, and malformed firing angles are hidden and cannot match a filter', () => {
  for (const value of ['invalid', 'null', '{}', '"spread-w"', '[]', '[1,null]', '[" "]']) {
    const fields = [{ key: 'spreads', value }];
    assert.deepEqual(getProductAttributes(fields, spreadFilters), []);
    assert.equal(
      matchesMetafieldSelections(fields, [{ key: 'spreads', values: ['spread-w'] }]),
      false,
    );
  }
  assert.deepEqual(getProductAttributes([], spreadFilters), []);
});
