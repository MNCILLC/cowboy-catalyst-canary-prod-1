import { clsx } from 'clsx';

import type { Product, ProductCardProps } from './index';

export function ProductCardAttributes({
  attributes,
  layout,
  className,
  compact = false,
}: Pick<Product, 'attributes'> &
  Pick<ProductCardProps, 'layout' | 'className'> & { compact?: boolean }) {
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
              'grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline bg-neutral-500',
              compact ? 'gap-x-2 px-2 py-1.5' : 'gap-x-3 px-3 py-2',
            )}
            key={key}
          >
            <dt className="break-words text-right font-semibold">{label}:</dt>
            <dd className="min-w-0 break-words">
              {values.map(({ value, label: valueLabel, swatchColor }, index) => (
                <span className="mr-1 inline-flex items-center gap-1.5" key={value}>
                  {!!swatchColor && (
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30"
                      style={{ backgroundColor: swatchColor }}
                    />
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
