import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';

import { Badge } from '@/vibes/soul/primitives/badge';
import { ButtonLink } from '@/vibes/soul/primitives/button-link';
import { PriceLabel } from '@/vibes/soul/primitives/price-label';
import { Rating } from '@/vibes/soul/primitives/rating';
import { ShowCrateFeatures } from '@/vibes/soul/primitives/show-crate-product-card/show-crate-features';
import { Image } from '~/components/image';
import { Link } from '~/components/link';

import { ProductCardAttributes } from './attributes';
import { Compare } from './compare';
import { ProductCardInventory } from './inventory';
import { ProductCardPromotions } from './promotions';

import type { ProductCardProps } from './index';

export function EnhancedGridProductCard({
  product,
  className,
  colorScheme = 'light',
  showCompare = false,
  compareLabel,
  compareParamName,
  imagePriority = false,
  imageSizes = '(min-width: 48rem) 25vw, 100vw',
  showRating = false,
  showStockLevel = false,
  purchaseAction,
}: ProductCardProps) {
  const t = useTranslations('Components.ProductCard');
  const hasAttributes = Boolean(product.enhancedGridAttributes?.length);

  return (
    <article
      className={clsx(
        'group relative h-full min-w-0 rounded-2xl border border-contrast-200 p-4 font-[family-name:var(--product-card-font-family,var(--font-family-body))] shadow-sm',
        {
          light:
            'bg-[var(--product-card-light-background,hsl(var(--contrast-100)))] text-[var(--product-card-light-title,hsl(var(--foreground)))]',
          dark: 'bg-[var(--product-card-dark-background,hsl(var(--contrast-500)))] text-[var(--product-card-dark-title,hsl(var(--background)))]',
        }[colorScheme],
        className,
      )}
      data-card-variant="enhanced"
      data-layout="grid"
    >
      <div
        className={clsx(
          'grid min-w-0 grid-cols-1 items-start gap-4',
          hasAttributes && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]',
        )}
      >
        <div className="relative aspect-square min-w-0 overflow-hidden rounded-xl md:col-start-1 md:row-start-1">
          {product.image ? (
            <Image
              alt={product.image.alt}
              className="object-contain transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
              fill
              preload={imagePriority}
              sizes={imageSizes}
              src={product.image.src}
            />
          ) : (
            <div className="flex h-full items-center justify-center break-words p-4 text-center text-xl font-semibold opacity-40">
              {product.title}
            </div>
          )}
          {!!product.badge && (
            <Badge className="absolute left-2 top-2" shape="rounded">
              {product.badge}
            </Badge>
          )}
        </div>

        <div className="min-w-0 space-y-2 md:col-span-full md:row-start-2">
          {!!product.subtitle && (
            <p className="text-xs font-medium opacity-75">{product.subtitle}</p>
          )}
          {!!product.showName && <p className="text-xs opacity-75">{product.showName}</p>}
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 flex-1 break-words text-lg font-semibold leading-tight">
              {product.title}
            </h3>
            <PriceLabel
              className="max-w-[50%] shrink-0 text-right text-base [&_abbr]:cursor-default [&_abbr]:no-underline"
              colorScheme={colorScheme}
              price={product.price ?? (product.isShow ? t('callForPricing') : '')}
            />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ProductCardInventory
                colorScheme={colorScheme}
                inventoryMessage={product.inventoryMessage}
                layout="grid"
                showStockLevel={showStockLevel || product.isShow === true}
                stockDisplayData={product.stockDisplayData}
                useEnhancedStockDisplay={product.useEnhancedStockDisplay}
              />
            </div>
            {Boolean(purchaseAction) && (
              <div className="relative z-10 ml-auto">{purchaseAction}</div>
            )}
          </div>
          <ProductCardPromotions promotions={product.promotions} />
          {showRating && typeof product.rating === 'number' && product.rating > 0 && (
            <Rating numberOfReviews={product.numberOfReviews} rating={product.rating} />
          )}
          <ShowCrateFeatures features={product.showFeatures ?? []} />
          {product.isShow && (
            <ButtonLink
              className="relative z-10"
              href={product.href}
              size="small"
              variant="tertiary"
            >
              {t('learnMore')}
              <span className="sr-only">: {product.title}</span>
            </ButtonLink>
          )}
        </div>

        <ProductCardAttributes
          attributes={product.enhancedGridAttributes}
          className="md:col-start-2 md:row-start-1"
          compact
          layout="grid"
        />
        {showCompare && (
          <div className="relative z-10 w-fit md:col-span-full">
            <Compare
              colorScheme={colorScheme}
              label={compareLabel}
              paramName={compareParamName}
              product={product}
            />
          </div>
        )}
      </div>
      {product.href !== '#' && (
        <Link
          aria-label={product.title}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--product-card-focus,hsl(var(--primary)))] focus-visible:ring-offset-2"
          href={product.href}
          id={product.id}
        />
      )}
    </article>
  );
}
