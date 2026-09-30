'use client';

import { PropsWithChildren, Suspense } from 'react';

import { Toaster } from '@/vibes/soul/primitives/toaster';
import { ForceRefresh } from '~/components/force-refresh';
import { SearchProvider } from '~/lib/search';

export function Providers({ children }: PropsWithChildren) {
  return (
    <SearchProvider>
      <Suspense fallback={null}>
        <ForceRefresh />
      </Suspense>
      <Toaster position="top-right" />
      {children}
    </SearchProvider>
  );
}
