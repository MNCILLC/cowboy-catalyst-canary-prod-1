import { clsx } from 'clsx';

import { ProductColorSwatch } from '@/vibes/soul/primitives/product-color-swatch';
import { ProductFiringAngleIcon } from '@/vibes/soul/primitives/product-firing-angle-icon';

import type { Product, ProductCardProps } from './index';

export function ProductCardAttributes({
  attributes,
  layout,
  className,
  compact = false,
}: Pick<Product, 'attributes'> &
  Pick<ProductCardProps, 'layout' | 'className'> & { compact?: boolean }) {
  const stacked = process.env.NEXT_PUBLIC_PRODUCT_CARD_ATTRIBUTES_LAYOUT === 'stacked';
  const condensed = process.env.NEXT_PUBLIC_PRODUCT_CARD_ATTRIBUTES_CONDENSED === 'true';

  if ((!compact && layout !== 'list') || !attributes?.length) return null;

  return (
    <div className={clsx('w-full', !compact && 'col-span-full mt-3', className)}>
      <dl
        className={clsx(
          'grid grid-cols-1 text-white',
          compact ? 'text-xs' : 'text-sm @2xl:grid-cols-3',
          condensed
            ? 'gap-px overflow-hidden rounded-lg border border-[#454c52] bg-[#454c52]'
            : ['items-start', compact ? 'gap-2' : 'gap-3'],
        )}
      >
        {attributes.map(({ key, label, values }) => (
          <div
            className={clsx(
              'grid min-w-0 overflow-hidden bg-neutral-500',
              !condensed && 'rounded-lg border border-[#454c52]',
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
                  {key === 'spreads' ? (
                    <ProductFiringAngleIcon label={valueLabel} value={value} />
                  ) : (
                    <span className="min-w-0">
                      {valueLabel}
                      {!stacked && index < values.length - 1 ? ',' : ''}
                    </span>
                  )}
                </span>
              ))}
            </dd>
          </div>
        ))}
        {condensed &&
          !compact &&
          Array.from({ length: (3 - (attributes.length % 3)) % 3 }, (_, index) => (
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
