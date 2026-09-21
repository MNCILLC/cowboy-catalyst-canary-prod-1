import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';

import { Badge } from '@/vibes/soul/primitives/badge';
import { ButtonLink } from '@/vibes/soul/primitives/button-link';
import { PriceLabel } from '@/vibes/soul/primitives/price-label';
import { ProductCardProps } from '@/vibes/soul/primitives/product-card';
import { ProductCardAttributes } from '@/vibes/soul/primitives/product-card/attributes';
import { ProductCardBadge } from '@/vibes/soul/primitives/product-card/badge';
import { Compare } from '@/vibes/soul/primitives/product-card/compare';
import { ProductCardDescription } from '@/vibes/soul/primitives/product-card/description';
import { Rating } from '@/vibes/soul/primitives/rating';
import { ShowCrateFeatures } from '@/vibes/soul/primitives/show-crate-product-card/show-crate-features';
import { Image } from '~/components/image';
import { Link } from '~/components/link';

export function ShowCrateProductCard({
  product,
  className,
  layout = 'grid',
  colorScheme = 'light',
  showCompare = false,
  compareLabel,
  compareParamName,
  imagePriority = false,
  imageSizes = '96px',
  showRating = false,
}: ProductCardProps) {
  const t = useTranslations('Components.ProductCard');
  const {
    id,
    title,
    listViewDescription,
    subtitle,
    badge,
    image,
    href,
    price,
    showFeatures = [],
    showName,
    stockDisplayData,
    inventoryMessage,
    rating,
    numberOfReviews,
  } = product;
  const stockLevelStatus = stockDisplayData?.stockLevelStatus ?? 'info';
  const stockMessage = stockDisplayData?.stockLevelMessage || inventoryMessage;

  return (
    <article
      className={clsx(
        'relative flex h-full min-w-0 scale-100 flex-col overflow-hidden rounded-2xl border border-gray-600 font-[family-name:var(--product-card-font-family,var(--font-family-body))] shadow-sm transition-transform duration-500 ease-out @container hover:z-10 hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none',
        {
          light:
            'bg-[var(--product-card-light-background,hsl(var(--contrast-100)))] text-[var(--product-card-light-title,hsl(var(--foreground)))]',
          dark: 'bg-[var(--product-card-dark-background,hsl(var(--contrast-500)))] text-[var(--product-card-dark-title,hsl(var(--background)))]',
        }[colorScheme],
        layout === 'grid' && 'max-w-md',
        className,
      )}
      data-layout={layout}
    >
      <div className="relative flex min-h-0 flex-1 flex-col gap-6 p-4">
        <div className="flex flex-wrap items-start gap-4">
          {image != null && (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg @xs:size-24">
              <Image
                alt={image.alt}
                className="object-contain"
                fill
                preload={imagePriority}
                sizes={imageSizes}
                src={image.src}
              />
            </div>
          )}
          <div className="min-w-0 flex-1 basis-32">
            {!!subtitle && (
              <p className="mb-1 text-sm font-medium uppercase tracking-wide opacity-75">
                {subtitle}
              </p>
            )}
            {(!!showName || !!stockMessage) && (
              <div className="mt-1 flex items-center justify-between gap-3">
                {!!showName && (
                  <span className="min-w-0 flex-1 break-words text-xs font-medium text-neutral-600">
                    {showName}
                  </span>
                )}
                {!!stockMessage && (
                  <Badge
                    className={clsx('ml-auto max-w-full break-words text-right', {
                      'bg-neutral-300': stockLevelStatus === 'info',
                      '!bg-red-700 !text-white': stockLevelStatus === 'error',
                      '!bg-green-700 !text-white': stockLevelStatus === 'success',
                    })}
                    shape="pill"
                    variant={stockLevelStatus}
                  >
                    {stockMessage}
                  </Badge>
                )}
              </div>
            )}
            <h3 className="mt-2 break-words font-[family-name:var(--font-family-heading)] text-xl font-semibold leading-tight">
              {title}
            </h3>
            <ProductCardDescription
              colorScheme={colorScheme}
              layout={layout}
              listViewDescription={listViewDescription}
            />
            <PriceLabel
              className="mt-2 [&_abbr]:cursor-default [&_abbr]:no-underline"
              colorScheme={colorScheme}
              price={price ?? t('callForPricing')}
            />
            {(product.isProUseOnly || !!badge) && (
              <div className="mt-0">
                <ProductCardBadge badge={badge} isProUseOnly={product.isProUseOnly} />
              </div>
            )}
          </div>
        </div>
        {!!stockDisplayData?.backorderAvailabilityPrompt && (
          <p className="text-sm opacity-75">{stockDisplayData.backorderAvailabilityPrompt}</p>
        )}
        {!!inventoryMessage && inventoryMessage !== stockMessage && (
          <p className="text-sm opacity-75">{inventoryMessage}</p>
        )}
        {/* {!!showDescription && (
          <p className="break-words text-base leading-relaxed opacity-75">{showDescription}</p>
        )} */}
        <ShowCrateFeatures
          className="-mt-4 border-t border-contrast-100 pt-2"
          features={showFeatures}
        />
        {showRating && typeof rating === 'number' && rating > 0 && (
          <Rating numberOfReviews={numberOfReviews} rating={rating} />
        )}
        <Link
          aria-label={title}
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--product-card-focus,hsl(var(--primary)))]"
          href={href}
        />
        <div className="relative z-20 mt-auto">
          <ButtonLink
            className="w-full after:hidden"
            href={href}
            shape="rounded"
            size="small"
            variant="tertiary"
          >
            {t('learnMore')}
            <span className="sr-only">: {title}</span>
          </ButtonLink>
        </div>
      </div>
      {showCompare && (
        <div className="px-4 pb-4">
          <Compare
            colorScheme={colorScheme}
            label={compareLabel}
            paramName={compareParamName}
            product={{ id, title, href, image }}
          />
        </div>
      )}
      <ProductCardAttributes
        attributes={product.attributes}
        className="px-4 pb-4"
        layout={layout}
      />
    </article>
  );
}
