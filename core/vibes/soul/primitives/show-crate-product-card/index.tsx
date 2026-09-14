import { clsx } from 'clsx';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/vibes/soul/primitives/badge';
import { ButtonLink } from '@/vibes/soul/primitives/button-link';
import { PriceLabel } from '@/vibes/soul/primitives/price-label';
import { ProductCardProps } from '@/vibes/soul/primitives/product-card';
import { Compare } from '@/vibes/soul/primitives/product-card/compare';
import { Rating } from '@/vibes/soul/primitives/rating';
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
    subtitle,
    badge,
    image,
    href,
    price,
    showFeatures = [],
    stockDisplayData,
    inventoryMessage,
    rating,
    numberOfReviews,
  } = product;
  const stockMessage = stockDisplayData?.stockLevelMessage || inventoryMessage;

  return (
    <article
      className={clsx(
        'flex h-full min-w-0 flex-col gap-6 overflow-hidden rounded-2xl border border-contrast-300 bg-slate-300 p-4 font-[family-name:var(--product-card-font-family,var(--font-family-body))] shadow-sm @container',
        {
          light:
            'bg-[var(--product-card-light-offset,hsl(var(--background)))] text-[var(--product-card-light-title,hsl(var(--foreground)))]',
          dark: 'bg-[var(--product-card-dark-offset,hsl(var(--foreground)))] text-[var(--product-card-dark-title,hsl(var(--background)))]',
        }[colorScheme],
        layout === 'grid' && 'max-w-md',
        className,
      )}
      data-layout={layout}
    >
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
          <h3 className="break-words font-[family-name:var(--font-family-heading)] text-xl font-semibold leading-tight">
            <Link
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              href={href}
            >
              {title}
            </Link>
          </h3>
          {!!stockMessage && (
            <div className="mt-1">
              <Badge className="max-w-full break-words" shape="pill" variant="info">
                {stockMessage}
              </Badge>
            </div>
          )}
          <PriceLabel
            className="mt-2 [&_abbr]:cursor-default [&_abbr]:no-underline"
            colorScheme={colorScheme}
            price={price ?? t('callForPricing')}
          />
          {!!badge && (
            <div className="mt-0">
              <Badge>{badge}</Badge>
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
      {showFeatures.length > 0 && (
        <ul className="-mt-4 space-y-1 border-t border-contrast-100 pt-2">
          {showFeatures.map((feature) => (
            <li className="flex items-start gap-3 text-xs leading-relaxed" key={feature.id}>
              <CircleCheck aria-hidden="true" className="mt-1 size-3 shrink-0 text-blue-700" />
              <span className="min-w-0 whitespace-pre-line break-words">{feature.value}</span>
            </li>
          ))}
        </ul>
      )}
      {showRating && typeof rating === 'number' && rating > 0 && (
        <Rating numberOfReviews={numberOfReviews} rating={rating} />
      )}
      <div className="mt-auto flex flex-col gap-4">
        <ButtonLink className="w-full p-0" href={href} shape="rounded" variant="tertiary">
          {t('learnMore')}
          <span className="sr-only">: {title}</span>
        </ButtonLink>
        {showCompare && (
          <Compare
            colorScheme={colorScheme}
            label={compareLabel}
            paramName={compareParamName}
            product={{ id, title, href, image }}
          />
        )}
      </div>
    </article>
  );
}
