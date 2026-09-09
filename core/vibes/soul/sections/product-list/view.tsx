'use client';

import { Grid2X2, List } from 'lucide-react';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Button } from '@/vibes/soul/primitives/button';
import { getCookieValue, PRODUCT_VIEW_COOKIE, setCookie } from '~/lib/client-cookies';
import { getConsentCookie } from '~/lib/consent-manager/cookies/client';

export type ProductView = 'grid' | 'list';

const ProductViewContext = createContext<{
  view: ProductView;
  setView: (view: ProductView) => void;
} | null>(null);

export function ProductViewProvider({
  children,
  initialView = 'grid',
}: {
  children: ReactNode;
  initialView?: ProductView;
}) {
  const [view, setView] = useState<ProductView>(initialView);

  useEffect(() => {
    // A prefetched page can have an older initial value than the current cookie.
    setView(getCookieValue(PRODUCT_VIEW_COOKIE) === 'list' ? 'list' : 'grid');
  }, []);

  const changeView = useCallback((nextView: ProductView) => {
    setView(nextView);

    if (!getConsentCookie()?.['c.functionality']) return;

    setCookie(PRODUCT_VIEW_COOKIE, nextView, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'Lax',
      ...(window.location.protocol === 'https:' ? { secure: true } : {}),
    });
  }, []);
  const value = useMemo(() => ({ view, setView: changeView }), [view, changeView]);

  return <ProductViewContext.Provider value={value}>{children}</ProductViewContext.Provider>;
}

export function useProductView() {
  return useContext(ProductViewContext)?.view ?? 'grid';
}

export function ProductViewSwitcher({
  label = 'Product view',
  gridLabel = 'Grid view',
  listLabel = 'List view',
}: {
  label?: string;
  gridLabel?: string;
  listLabel?: string;
}) {
  const context = useContext(ProductViewContext);

  if (!context) return null;

  return (
    <div aria-label={label} className="flex shrink-0 gap-1" role="group">
      <Button
        aria-label={gridLabel}
        aria-pressed={context.view === 'grid'}
        onClick={() => context.setView('grid')}
        shape="circle"
        size="medium"
        title={gridLabel}
        variant={context.view === 'grid' ? 'primary' : 'tertiary'}
      >
        <Grid2X2 aria-hidden="true" size={20} />
      </Button>
      <Button
        aria-label={listLabel}
        aria-pressed={context.view === 'list'}
        onClick={() => context.setView('list')}
        shape="circle"
        size="medium"
        title={listLabel}
        variant={context.view === 'list' ? 'primary' : 'tertiary'}
      >
        <List aria-hidden="true" size={20} />
      </Button>
    </div>
  );
}
