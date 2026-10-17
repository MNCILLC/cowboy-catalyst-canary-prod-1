import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_VIEWED_PRODUCTS, normalizeHistory, parseHistory, recordView } from './history.ts';

test('views are ordered by recency and a repeated view moves to the front', () => {
  let history = recordView([], '1371', 1000);
  history = recordView(history, '1637', 2000);
  history = recordView(history, '1371', 3000);
  assert.deepEqual(
    history.map((item) => item.id),
    ['1371', '1637'],
  );
});

test('history excludes expired, invalid, duplicate, and future entries', () => {
  const now = 40 * 24 * 60 * 60 * 1000;
  assert.deepEqual(
    normalizeHistory(
      [
        { id: '1', viewedAt: 1 },
        { id: '2', viewedAt: now - 100 },
        { id: '2', viewedAt: now - 50 },
        { id: '3', viewedAt: now + 1 },
        { id: '-4', viewedAt: now },
        { id: '5oops', viewedAt: now },
        { id: '6', viewedAt: 'today' },
        null,
      ],
      now,
    ),
    [{ id: '2', viewedAt: now - 50 }],
  );
  for (const raw of [null, 'broken', '{}', 'null', '[1,2]'])
    assert.deepEqual(parseHistory(raw, now), []);
});

test('history keeps only the latest 20 products', () => {
  const history = normalizeHistory(
    Array.from({ length: 30 }, (_, n) => ({ id: String(n + 1), viewedAt: n + 1 })),
    30,
  );
  assert.equal(history.length, MAX_VIEWED_PRODUCTS);
  assert.equal(history[0]?.id, '30');
  assert.equal(history.at(-1)?.id, '11');
});
