export interface ViewedProduct {
  id: string;
  viewedAt: number;
}

export const MAX_VIEWED_PRODUCTS = 20;

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeHistory(value: unknown, now = Date.now()): ViewedProduct[] {
  if (!Array.isArray(value)) return [];

  const entries = value
    .filter((entry: unknown): entry is ViewedProduct => {
      if (typeof entry !== 'object' || entry === null || !('id' in entry) || !('viewedAt' in entry))
        return false;

      const { id, viewedAt } = entry;

      return (
        typeof id === 'string' &&
        /^[1-9]\d*$/.test(id) &&
        Number.isSafeInteger(Number(id)) &&
        typeof viewedAt === 'number' &&
        Number.isFinite(viewedAt) &&
        viewedAt <= now &&
        viewedAt > now - MAX_AGE_MS
      );
    })
    .sort((a, b) => b.viewedAt - a.viewedAt);

  return entries
    .filter((entry, index) => entries.findIndex((item) => item.id === entry.id) === index)
    .slice(0, MAX_VIEWED_PRODUCTS);
}

export function parseHistory(raw: string | null, now = Date.now()): ViewedProduct[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');

    return normalizeHistory(value, now);
  } catch {
    return [];
  }
}

export function recordView(
  history: ViewedProduct[],
  id: string,
  now = Date.now(),
): ViewedProduct[] {
  return normalizeHistory(
    [{ id, viewedAt: now }, ...history.filter((entry) => entry.id !== id)],
    now,
  );
}
