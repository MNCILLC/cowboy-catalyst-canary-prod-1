import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectShoppingLocation } from './select-location.ts';

const locations = [
  { id: 1, label: 'Georgia', address: { postalCode: '30224', countryCode: 'US' } },
  { id: 2, label: 'South Carolina', address: { postalCode: '29163', countryCode: 'US' } },
  { id: 3, label: 'Pennsylvania', address: { postalCode: '17931', countryCode: 'US' } },
  { id: 4, label: 'Texas', address: { postalCode: '75751', countryCode: 'US' } },
];

const address = (postalCode: string) => ({ postalCode, countryCode: 'US' });

test('anonymous shoppers default to location 1 regardless of list order', () => {
  assert.equal(selectShoppingLocation([...locations].reverse())?.id, 1);
});

test('a customer ZIP chooses the closest warehouse across all four locations', () => {
  for (const [zip, id] of [
    ['30301', 1],
    ['29201', 2],
    ['19103', 3],
    ['75201', 4],
  ] as const) {
    assert.equal(selectShoppingLocation(locations, undefined, address(zip))?.id, id);
  }
});

test('manual location choices override customer defaults and work for anonymous shoppers', () => {
  assert.equal(selectShoppingLocation(locations, 2, address('75201'))?.id, 2);
  assert.equal(selectShoppingLocation(locations, 4)?.id, 4);
});

test('stale or invalid manual choices fall back to the customer default or location 1', () => {
  for (const id of [99, 0, -1, NaN, 1.5]) {
    assert.equal(selectShoppingLocation(locations, id, address('75201'))?.id, 4);
    assert.equal(selectShoppingLocation(locations, id)?.id, 1);
  }
});

test('ZIP+4 and surrounding whitespace are normalized without losing leading zeros', () => {
  assert.equal(selectShoppingLocation(locations, undefined, address(' 75201-1234 '))?.id, 4);
  assert.equal(selectShoppingLocation(locations, undefined, address('02108'))?.id, 3);
});

test('missing, invalid, unknown, and non-US ZIPs fall back safely', () => {
  for (const customer of [
    undefined,
    null,
    address(''),
    address('00000'),
    address('bad-zip'),
    { postalCode: '75201', countryCode: 'FR' },
  ]) {
    assert.equal(selectShoppingLocation(locations, undefined, customer)?.id, 1);
  }
});

test('warehouse coordinates take precedence over the warehouse ZIP centroid', () => {
  const coordinates = { latitude: 32.78, longitude: -96.8 };
  const candidates = [locations[0]!, { id: 7, label: 'Near Dallas', coordinates }];
  assert.equal(selectShoppingLocation(candidates, undefined, address('75201'))?.id, 7);
});

test('invalid warehouse coordinates use ZIP fallback and unknown locations do not win', () => {
  const candidates = [
    ...locations.map((location) => ({ ...location, coordinates: { latitude: 0, longitude: 0 } })),
    { id: 7, label: 'Missing position', coordinates: { latitude: NaN, longitude: 200 } },
  ];
  assert.equal(selectShoppingLocation(candidates, undefined, address('75201'))?.id, 4);
});

test('ties are deterministic and empty or unmappable location sets are safe', () => {
  const coordinates = { latitude: 32.78, longitude: -96.8 };
  assert.equal(
    selectShoppingLocation(
      [
        { id: 8, label: 'B', coordinates },
        { id: 7, label: 'A', coordinates },
      ],
      undefined,
      address('75201'),
    )?.id,
    7,
  );
  assert.equal(selectShoppingLocation([], undefined, address('75201')), undefined);
  assert.equal(
    selectShoppingLocation([{ id: 1, label: 'No position' }], undefined, address('75201'))?.id,
    1,
  );
});
