import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getCatalogPageCount,
  getCatalogPageForDestination,
  getCatalogPageSlice,
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
