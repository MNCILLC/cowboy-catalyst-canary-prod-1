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
          'grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[#454c52] bg-[#454c52] text-white',
          compact ? 'text-xs' : 'text-sm @2xl:grid-cols-3',
        )}
      >
        {attributes.map(({ key, label, values }) => (
          <div
            className={clsx(
              'grid min-w-0 bg-neutral-500',
              stacked ? 'grid-cols-1' : 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
              key === 'colors'
                ? stacked && 'grid-rows-[auto_1fr]'
                : [
                    'content-start items-start',
                    stacked && 'gap-y-1',
                    compact ? 'gap-x-2 px-2 py-1.5' : 'gap-x-3 px-3 py-2',
                  ],
            )}
            key={key}
          >
            <dt
              className={clsx(
                'break-words font-extrabold',
                compact ? 'text-sm' : 'text-base',
                stacked ? 'text-center' : 'text-right',
                key === 'colors' && (compact ? 'px-2 py-1.5' : 'px-3 py-2'),
              )}
            >
              {label}
              {!stacked && ':'}
            </dt>
            {/* Extend separators through empty cells, then clip them at the grid edges.
                Use an opaque color so overlapping separators stay the same shade. */}
            <dd
              className={clsx(
                'min-w-0 break-words',
                key === 'colors'
                  ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-0 overflow-hidden border-t border-[#ababab] text-left'
                  : stacked && 'text-center',
              )}
            >
              {values.map(({ value, label: valueLabel, swatchColor }, index) => (
                <span
                  className={clsx(
                    key === 'colors'
                      ? 'relative flex min-w-0 items-start gap-1.5 px-1.5 py-1 before:pointer-events-none before:absolute before:-left-px before:-top-px before:h-[100vmax] before:w-[100vmax] before:border-l before:border-t before:border-[#ababab]'
                      : 'mr-1 inline-flex items-center gap-1.5 align-top',
                  )}
                  key={value}
                >
                  {!!swatchColor && (
                    <ProductColorSwatch borderClassName="border-white/30" color={swatchColor} />
                  )}
                  <span className="min-w-0">
                    {valueLabel}
                    {key !== 'colors' && index < values.length - 1 ? ',' : ''}
                  </span>
                </span>
              ))}
            </dd>
          </div>
        ))}
        {Array.from({ length: compact ? 0 : (3 - (attributes.length % 3)) % 3 }, (_, index) => (
          <div
            aria-hidden="true"
            className="hidden bg-neutral-500 @2xl:block"
            key={`empty-${index}`}
          />
        ))}
      </dl>
    </div>
  );
}
