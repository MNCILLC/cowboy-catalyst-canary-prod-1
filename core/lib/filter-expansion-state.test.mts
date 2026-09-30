import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getFilterExpansionSnapshot,
  getServerFilterExpansionSnapshot,
  parseFilterExpansion,
  saveFilterExpansion,
  subscribeToFilterExpansion,
} from '../vibes/soul/sections/products-list-section/filter-expansion-state.ts';

test('invalid stored preferences are ignored and only boolean preferences are restored', () => {
  ['invalid', 'null', '[]', 'false'].forEach((value) => {
    assert.deepEqual(parseFilterExpansion(value), {});
  });

  assert.deepEqual(parseFilterExpansion('{"brand":false,"mf_colors":true,"stock":"false"}'), {
    brand: false,
    mf_colors: true,
  });
  assert.equal(getServerFilterExpansionSnapshot(), '{}');
});

test('preferences persist, merge across pages, synchronize panels, and tolerate blocked writes', () => {
  const target = new EventTarget();
  const storage = new Map();
  let blocked = false;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          if (blocked) throw new Error('Storage unavailable');
          storage.set(key, value);
        },
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    },
  });

  let notifications = 0;
  const unsubscribe = subscribeToFilterExpansion(() => {
    notifications += 1;
  });

  try {
    assert.deepEqual(parseFilterExpansion(getFilterExpansionSnapshot()), {});
    saveFilterExpansion({ brand: false, mf_colors: true });
    saveFilterExpansion({ stock: false });
    assert.deepEqual(parseFilterExpansion(getFilterExpansionSnapshot()), {
      brand: false,
      mf_colors: true,
      stock: false,
    });
    assert.equal(notifications, 2);
    assert.equal(storage.size, 1);
    assert.equal([...storage.values()][0], getFilterExpansionSnapshot());

    // Another tab changes the saved preference.
    const key = [...storage.keys()][0];

    storage.set(key, '{"brand":true}');
    target.dispatchEvent(Object.assign(new Event('storage'), { key }));
    assert.equal(notifications, 3);
    assert.deepEqual(parseFilterExpansion(getFilterExpansionSnapshot()), { brand: true });

    blocked = true;
    saveFilterExpansion({ brand: false });
    assert.deepEqual(parseFilterExpansion(getFilterExpansionSnapshot()), { brand: false });
    assert.equal(notifications, 4);
    unsubscribe();
    saveFilterExpansion({ stock: true });
    assert.equal(notifications, 4);
  } finally {
    unsubscribe();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
