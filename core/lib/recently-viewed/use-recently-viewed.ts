'use client';

import { useConsentManager } from '@c15t/nextjs/client';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';

import { normalizeHistory, parseHistory, recordView, ViewedProduct } from './history';

// History stays in memory when functional storage is not permitted or available.
const histories = new Map<string, ViewedProduct[]>();
const changedEvent = 'catalyst:recently-viewed';

export function useRecentlyViewed(enabled = true, productId?: string) {
  const locale = useLocale();
  const { consents, hasConsented } = useConsentManager();
  const consentKnown = hasConsented();
  const persist = consentKnown && consents.functionality;
  const storageKey = `catalyst:recently-viewed:v1:${locale}`;
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let history = normalizeHistory(histories.get(storageKey) ?? []);

    try {
      if (persist) {
        history = normalizeHistory([...history, ...parseHistory(localStorage.getItem(storageKey))]);
      } else if (consentKnown) {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Blocked storage must not prevent browsing or the in-memory history.
    }

    if (productId) history = recordView(history, productId);
    histories.set(storageKey, history);

    if (persist) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(history));
      } catch {
        // Continue with in-memory history when browser storage is unavailable.
      }
    }

    const update = () =>
      setIds(normalizeHistory(histories.get(storageKey) ?? []).map((item) => item.id));
    const onStorage = (event: StorageEvent) => {
      if (!persist || event.key !== storageKey) return;
      histories.set(storageKey, parseHistory(event.newValue));
      update();
    };

    window.addEventListener(changedEvent, update);
    window.addEventListener('storage', onStorage);
    window.dispatchEvent(new Event(changedEvent));

    return () => {
      window.removeEventListener(changedEvent, update);
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, storageKey, productId, persist, consentKnown]);

  return ids;
}
