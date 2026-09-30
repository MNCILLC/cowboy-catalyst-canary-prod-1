'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { usePathname, useRouter } from '~/i18n/routing';
import { FORCE_REFRESH_COOKIE, getCookieValue, setCookie } from '~/lib/client-cookies';

export const ForceRefresh = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const shouldRefresh = getCookieValue(FORCE_REFRESH_COOKIE) === 'true';

    if (shouldRefresh) {
      // Consume the signal before refreshing to prevent a refresh loop.
      setCookie(FORCE_REFRESH_COOKIE, '', { path: '/', maxAge: 0 });
      router.refresh();
    }
  }, [pathname, searchParams, router]);

  return null;
};
