'use client';

import { useSyncExternalStore } from 'react';

import { Switch } from '@/vibes/soul/form/switch';

const STORAGE_KEY = 'catalyst:show-product-attributes';
const CHANGE_EVENT = 'catalyst:product-attributes-change';
let fallbackValue = true;
let storageUnavailable = false;

function getSnapshot() {
  if (storageUnavailable) return fallbackValue;

  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return fallbackValue;
  }
}

function getServerSnapshot() {
  return true;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function setVisibility(visible: boolean) {
  fallbackValue = visible;

  try {
    window.localStorage.setItem(STORAGE_KEY, String(visible));
  } catch {
    // Keep the toggle usable when browser storage is blocked or full.
    storageUnavailable = true;
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useProductAttributesVisibility() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ProductAttributesToggle() {
  const visible = useProductAttributesVisibility();

  return (
    <div className="shrink-0 whitespace-nowrap">
      <Switch
        checked={visible}
        label="Show attributes"
        onCheckedChange={setVisibility}
        size="small"
      />
    </div>
  );
}
