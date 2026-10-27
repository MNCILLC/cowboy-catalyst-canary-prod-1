import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getCatalogPageCount,
  getCatalogPageForDestination,
  getCatalogPageSlice,
  getCatalogPageRange,
} from '../vibes/soul/sections/digital-catalog/page-mapping.ts';

test('a three-sheet Two-Up catalog reads left, right, then the next sheet', () => {
  assert.equal(getCatalogPageCount(3, true), 6);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((page) => getCatalogPageSlice(page, true)),
    [
      { pdfPage: 1, half: 'left' },
      { pdfPage: 1, half: 'right' },
      { pdfPage: 2, half: 'left' },
      { pdfPage: 2, half: 'right' },
      { pdfPage: 3, half: 'left' },
      { pdfPage: 3, half: 'right' },
    ],
  );
});

test('a one-sheet catalog has two digital pages, and unloaded documents have none', () => {
  assert.equal(getCatalogPageCount(1, true), 2);
  assert.equal(getCatalogPageCount(0, true), 0);
  assert.equal(getCatalogPageCount(0, false), 0);
});

test('turning Two-Up off preserves original page counts and uncropped pages', () => {
  assert.equal(getCatalogPageCount(3, false), 3);
  assert.deepEqual(
    [1, 2, 3].map((page) => getCatalogPageSlice(page, false)),
    [
      { pdfPage: 1, half: undefined },
      { pdfPage: 2, half: undefined },
      { pdfPage: 3, half: undefined },
    ],
  );
});

test('PDF links target the left half of the correct source sheet', () => {
  assert.equal(getCatalogPageForDestination(1, true), 1);
  assert.equal(getCatalogPageForDestination(2, true), 3);
  assert.equal(getCatalogPageForDestination(3, true), 5);
  assert.equal(getCatalogPageForDestination(3, false), 3);
});

test('Two-Up spreads pair both halves of each original PDF sheet, including page jumps', () => {
  for (const page of [1, 2, 3, 4, 5, 6]) {
    const { firstPage, lastPage } = getCatalogPageRange(page, 6, true, true);
    const sourcePage = Math.ceil(page / 2);

    assert.deepEqual([firstPage, lastPage], [sourcePage * 2 - 1, sourcePage * 2]);
    assert.deepEqual(getCatalogPageSlice(firstPage, true), { pdfPage: sourcePage, half: 'left' });
    assert.deepEqual(getCatalogPageSlice(lastPage, true), { pdfPage: sourcePage, half: 'right' });
  }
  assert.deepEqual(getCatalogPageRange(1, 2, true, true), { firstPage: 1, lastPage: 2 });
  assert.deepEqual(getCatalogPageRange(1, 0, true, true), { firstPage: 1, lastPage: 1 });
});

test('ordinary spreads retain a standalone cover and handle an unpaired last page', () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((page) => getCatalogPageRange(page, 4, true, false)),
    [
      { firstPage: 1, lastPage: 1 },
      { firstPage: 2, lastPage: 3 },
      { firstPage: 2, lastPage: 3 },
      { firstPage: 4, lastPage: 4 },
    ],
  );
});

test('single-page and narrow layouts preserve the requested page in either mode', () => {
  for (const twoUp of [true, false]) {
    for (const page of [1, 2, 3, 4, 5, 6]) {
      assert.deepEqual(getCatalogPageRange(page, 6, false, twoUp), {
        firstPage: page,
        lastPage: page,
      });
    }
  }
});
