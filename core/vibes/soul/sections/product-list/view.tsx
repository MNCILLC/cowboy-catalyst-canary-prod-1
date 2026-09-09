'use client';

import { Grid2X2, List } from 'lucide-react';
import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import { Button } from '@/vibes/soul/primitives/button';

export type ProductView = 'grid' | 'list';

const ProductViewContext = createContext<{
  view: ProductView;
  setView: (view: ProductView) => void;
} | null>(null);

export function ProductViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ProductView>('grid');
  const value = useMemo(() => ({ view, setView }), [view]);

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
