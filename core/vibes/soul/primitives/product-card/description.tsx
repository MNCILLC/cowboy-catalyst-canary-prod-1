import { clsx } from 'clsx';

import type { Product, ProductCardProps } from './index';

export function ProductCardDescription({
  listViewDescription,
  layout,
  colorScheme = 'light',
}: Pick<Product, 'listViewDescription'> & Pick<ProductCardProps, 'layout' | 'colorScheme'>) {
  if (layout !== 'list' || !listViewDescription?.trim()) return null;

  return (
    <p
      className={clsx(
        'mt-2 min-w-0 flex-1 break-words text-sm leading-relaxed',
        {
          light: 'text-[var(--product-card-light-subtitle,hsl(var(--foreground)/75%))]',
          dark: 'text-[var(--product-card-dark-subtitle,hsl(var(--background)/75%))]',
        }[colorScheme],
      )}
    >
      {listViewDescription}
    </p>
  );
}
