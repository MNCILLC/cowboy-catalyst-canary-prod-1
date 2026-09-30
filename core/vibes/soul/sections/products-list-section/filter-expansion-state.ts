const STORAGE_KEY = 'catalyst:filter-expansion:v1';
const CHANGE_EVENT = 'catalyst:filter-expansion-change';
let fallbackSnapshot = '{}';
let storageUnavailable = false;

export function parseFilterExpansion(snapshot: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(snapshot);

    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}

export function getFilterExpansionSnapshot(): string {
  if (storageUnavailable) return fallbackSnapshot;

  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '{}';
  } catch {
    // Keep the preference for this session when browser storage is unavailable.
    return fallbackSnapshot;
  }
}

export function getServerFilterExpansionSnapshot(): string {
  return '{}';
}

export function subscribeToFilterExpansion(onChange: () => void) {
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

export function saveFilterExpansion(changes: Record<string, boolean>) {
  const snapshot = JSON.stringify({
    ...parseFilterExpansion(getFilterExpansionSnapshot()),
    ...changes,
  });

  fallbackSnapshot = snapshot;

  try {
    window.localStorage.setItem(STORAGE_KEY, snapshot);
  } catch {
    // A blocked or full storage area must not prevent opening or closing filters.
    storageUnavailable = true;
  }

  // The storage event only reaches other tabs; notify both panels in this tab too.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
