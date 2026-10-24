import { clsx } from 'clsx';

import { ProductColorSwatch } from '@/vibes/soul/primitives/product-color-swatch';

import type { Product, ProductCardProps } from './index';

export function ProductCardAttributes({
  attributes,
  layout,
  className,
  compact = false,
}: Pick<Product, 'attributes'> &
  Pick<ProductCardProps, 'layout' | 'className'> & { compact?: boolean }) {
  const stacked = process.env.NEXT_PUBLIC_PRODUCT_CARD_ATTRIBUTES_LAYOUT === 'stacked';

  if ((!compact && layout !== 'list') || !attributes?.length) return null;

  return (
    <div className={clsx('w-full', !compact && 'col-span-full mt-3', className)}>
      <dl
        className={clsx(
          'grid grid-cols-1 items-start text-white',
          compact ? 'gap-2 text-xs' : 'gap-3 text-sm @2xl:grid-cols-3',
        )}
      >
        {attributes.map(({ key, label, values }) => (
          <div
            className={clsx(
              'grid min-w-0 overflow-hidden rounded-lg border border-[#454c52] bg-neutral-500',
              stacked ? 'grid-cols-1' : 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
              stacked && 'grid-rows-[auto_1fr]',
            )}
            key={key}
          >
            <dt
              className={clsx(
                'break-words font-extrabold',
                compact ? 'text-sm' : 'text-base',
                stacked ? 'text-center' : 'text-right',
                compact ? 'px-2 py-1.5' : 'px-3 py-2',
              )}
            >
              {label}
              {!stacked && ':'}
            </dt>
            {/* Stacked separators extend through empty cells and are clipped at the grid edges.
                Use an opaque color so overlapping separators stay the same shade. */}
            <dd
              className={clsx(
                'min-w-0 break-words text-left',
                stacked
                  ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-0 overflow-hidden border-t border-[#ababab]'
                  : ['self-start', compact ? 'px-2 py-1.5' : 'px-3 py-2'],
              )}
            >
              {values.map(({ value, label: valueLabel, swatchColor }, index) => (
                <span
                  className={clsx(
                    stacked
                      ? 'relative flex min-w-0 items-start justify-center gap-1.5 px-1.5 py-1 text-center before:pointer-events-none before:absolute before:-left-px before:-top-px before:h-[100vmax] before:w-[100vmax] before:border-l before:border-t before:border-[#ababab]'
                      : 'mr-1 inline-flex max-w-full items-start gap-1.5 align-top',
                  )}
                  key={value}
                >
                  {!!swatchColor && (
                    <ProductColorSwatch borderClassName="border-white/30" color={swatchColor} />
                  )}
                  <span className="min-w-0">
                    {valueLabel}
                    {!stacked && index < values.length - 1 ? ',' : ''}
                  </span>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
