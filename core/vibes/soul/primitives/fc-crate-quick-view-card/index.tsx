'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/vibes/soul/primitives/badge';
import { Button } from '@/vibes/soul/primitives/button';
import { PriceLabel } from '@/vibes/soul/primitives/price-label';
import type { Product, ProductCardProps } from '@/vibes/soul/primitives/product-card';
import { ShowCrateFeatures } from '@/vibes/soul/primitives/show-crate-product-card/show-crate-features';
import { ProductDescription } from '@/vibes/soul/sections/product-detail/product-description';
import { Image } from '~/components/image';
import { Link } from '~/components/link';

function StockLevel({ product }: { product: Product }) {
  const t = useTranslations('Components.ProductCard');
  const { stockDisplayData, inventoryMessage, isInStock } = product;
  let fallback = t('stockUnavailable');

  if (isInStock !== undefined) fallback = isInStock ? t('inStock') : t('outOfStock');

  const message = stockDisplayData?.stockLevelMessage || inventoryMessage || fallback;
  const status = stockDisplayData?.stockLevelStatus ?? (isInStock === false ? 'error' : 'info');

  return (
    <div className="space-y-1 text-sm">
      <Badge
        className={clsx('max-w-full whitespace-normal break-words', {
          'bg-neutral-300 !text-black': status === 'info',
          '!bg-red-700 !text-white': status === 'error',
          '!bg-green-700 !text-white': status === 'success',
        })}
        shape="pill"
        variant={status}
      >
        {message}
      </Badge>
      {!!stockDisplayData?.backorderAvailabilityPrompt && (
        <p>{stockDisplayData.backorderAvailabilityPrompt}</p>
      )}
    </div>
  );
}

export function FcCrateQuickViewCard({
  product,
  className,
  layout = 'grid',
  colorScheme = 'light',
  imagePriority = false,
  imageSizes = '(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 42rem) 33vw, (min-width: 24rem) 50vw, 100vw',
}: ProductCardProps) {
  const t = useTranslations('Components.ProductCard');
  const {
    title,
    image,
    href,
    price,
    showFeatures = [],
    descriptionHtml,
    showDescription,
  } = product;
  const description = descriptionHtml?.trim() || showDescription?.trim();

  return (
    <article
      className={clsx(
        'flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-gray-600 p-4 font-[family-name:var(--product-card-font-family,var(--font-family-body))] shadow-sm @container',
        {
          light:
            'bg-[var(--product-card-light-background,hsl(var(--contrast-100)))] text-[var(--product-card-light-title,hsl(var(--foreground)))]',
          dark: 'bg-[var(--product-card-dark-background,hsl(var(--contrast-500)))] text-[var(--product-card-dark-title,hsl(var(--background)))]',
        }[colorScheme],
        layout === 'grid' && 'max-w-md',
        className,
      )}
      data-card-variant="fc-crate-quick-view"
      data-layout={layout}
    >
      <Link
        aria-label={title}
        className="relative block aspect-square w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        href={href}
        tabIndex={-1}
      >
        {image ? (
          <Image
            alt={image.alt}
            className="object-contain"
            fill
            preload={imagePriority}
            sizes={imageSizes}
            src={image.src}
          />
        ) : (
          <div className="flex h-full items-center justify-center break-words p-4 text-center text-xl opacity-50">
            {title}
          </div>
        )}
      </Link>
      <h3 className="break-words font-[family-name:var(--font-family-heading)] text-xl font-semibold leading-tight">
        <Link
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          href={href}
        >
          {title}
        </Link>
      </h3>
      <PriceLabel
        className="[&_abbr]:cursor-default [&_abbr]:no-underline"
        colorScheme={colorScheme}
        price={price ?? t('callForPricing')}
      />
      <StockLevel product={product} />
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <Button className="mt-auto w-full" shape="rounded" size="small" variant="tertiary">
            {t('quickView')}
            <span className="sr-only">: {title}</span>
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-background p-6 text-foreground shadow-xl focus:outline-none sm:p-8"
          >
            <Dialog.Close asChild>
              <Button
                aria-label={t('closeQuickView')}
                className="absolute right-2 top-2 z-10"
                shape="circle"
                size="x-small"
                variant="ghost"
              >
                <XIcon aria-hidden="true" size={20} />
              </Button>
            </Dialog.Close>
            <div
              className={clsx(
                'mt-4 grid items-stretch gap-4 sm:gap-6',
                image ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              <div className="flex min-w-0 flex-col items-start gap-4 pb-6">
                <Dialog.Title className="break-words font-[family-name:var(--font-family-heading)] text-2xl font-semibold">
                  {title}
                </Dialog.Title>
                <PriceLabel className="text-xl" price={price ?? t('callForPricing')} />
                <StockLevel product={product} />
              </div>
              {image && (
                <div className="relative min-w-0 overflow-hidden rounded-lg">
                  <Image
                    alt={image.alt}
                    className="object-contain"
                    fill
                    sizes="(min-width: 672px) 292px, calc((100vw - 96px) / 2)"
                    src={image.src}
                  />
                </div>
              )}
            </div>
            <div className="mb-6 space-y-3 border-t border-contrast-100 pt-5">
              <h3 className="text-lg font-semibold">{t('quickViewSpecifications')}</h3>
              {showFeatures.length > 0 ? (
                <ShowCrateFeatures features={showFeatures} textSize="base" />
              ) : (
                <p className="text-sm text-contrast-500">{t('noSpecifications')}</p>
              )}
            </div>
            <h3 className="text-lg font-semibold">{t('quickViewDescription')}</h3>
            {description ? (
              <ProductDescription label={t('quickViewDescription')}>
                {description}
              </ProductDescription>
            ) : (
              <p className="mt-3 text-sm text-contrast-500">{t('noDescription')}</p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </article>
  );
}
