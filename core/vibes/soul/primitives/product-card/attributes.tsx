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
              stacked
                ? 'grid-cols-1 gap-y-1'
                : 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline',
              compact ? 'gap-x-2 px-2 py-1.5' : 'gap-x-3 px-3 py-2',
            )}
            key={key}
          >
            <dt
              className={clsx(
                'break-words font-extrabold',
                compact ? 'text-sm' : 'text-base',
                stacked ? 'text-center' : 'text-right',
              )}
            >
              {label}
              {!stacked && ':'}
            </dt>
            <dd className={clsx('min-w-0 break-words', stacked && 'text-center')}>
              {values.map(({ value, label: valueLabel, swatchColor }, index) => (
                <span className="mr-1 inline-flex items-center gap-1.5" key={value}>
                  {!!swatchColor && (
                    <ProductColorSwatch borderClassName="border-white/30" color={swatchColor} />
                  )}
                  <span>
                    {valueLabel}
                    {index < values.length - 1 ? ',' : ''}
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
