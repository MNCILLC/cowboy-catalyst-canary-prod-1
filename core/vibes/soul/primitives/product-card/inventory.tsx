import { clsx } from 'clsx';

import { EnhancedStockLevel } from '@/vibes/soul/primitives/enhanced-stock-level';

import type { Product, ProductCardProps } from './index';

export function ProductCardInventory({
  colorScheme,
  showStockLevel,
  inventoryMessage,
  layout,
  stockDisplayData,
  useEnhancedStockDisplay,
}: Pick<Product, 'inventoryMessage' | 'stockDisplayData' | 'useEnhancedStockDisplay'> &
  Required<Pick<ProductCardProps, 'colorScheme' | 'layout' | 'showStockLevel'>>) {
  if (useEnhancedStockDisplay) {
    const stockMessage = stockDisplayData?.stockLevelMessage || inventoryMessage;

    return (
      <div className="space-y-1 text-sm">
        <EnhancedStockLevel message={stockMessage} status={stockDisplayData?.stockLevelStatus} />
        {!!stockDisplayData?.backorderAvailabilityPrompt && (
          <p className="opacity-75">{stockDisplayData.backorderAvailabilityPrompt}</p>
        )}
        {!!inventoryMessage && inventoryMessage !== stockMessage && (
          <p className="opacity-75">{inventoryMessage}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {(layout === 'list' || showStockLevel) && stockDisplayData && (
        <div
          className={clsx(
            'flex flex-wrap gap-x-2.5 gap-y-2 text-sm',
            {
              light: 'text-[var(--product-card-light-title,hsl(var(--foreground)))]',
              dark: 'text-[var(--product-card-dark-title,hsl(var(--background)))]',
            }[colorScheme],
          )}
        >
          <span
            className={clsx(
              'font-semibold',
              stockDisplayData.stockLevelStatus === 'error' && 'text-error',
            )}
          >
            {stockDisplayData.stockLevelMessage}
          </span>
          {!!stockDisplayData.backorderAvailabilityPrompt && (
            <span className="border-s border-contrast-100 pl-2.5">
              {stockDisplayData.backorderAvailabilityPrompt}
            </span>
          )}
        </div>
      )}
      <span
        className={clsx(
          'block text-sm font-normal',
          {
            light: 'text-[var(--product-card-light-message,hsl(var(--foreground)/75%))]',
            dark: 'text-[var(--product-card-dark-message,hsl(var(--background)/75%))]',
          }[colorScheme],
        )}
      >
        {(layout === 'list' || showStockLevel) &&
        inventoryMessage === stockDisplayData?.stockLevelMessage
          ? null
          : inventoryMessage}
      </span>
    </>
  );
}
