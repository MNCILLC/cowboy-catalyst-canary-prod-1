'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CSSProperties, useEffect, useRef, useState } from 'react';

import { Badge } from '@/vibes/soul/primitives/badge';
import { Button } from '@/vibes/soul/primitives/button';
import { PriceLabel } from '@/vibes/soul/primitives/price-label';
import type { Product, ProductCardProps } from '@/vibes/soul/primitives/product-card';
import { ShowCrateFeatures } from '@/vibes/soul/primitives/show-crate-product-card/show-crate-features';
import { ProductDescription } from '@/vibes/soul/sections/product-detail/product-description';
import { Link } from '~/components/link';

import { ProductImageCarousel } from './product-image-carousel';

function CardTitle({ title, href, style }: { title: string; href: string; style?: CSSProperties }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const heading = headingRef.current;
    const text = textRef.current;

    if (!heading || !text) return;

    let disposed = false;
    const fit = () => {
      if (disposed) return;

      const styles = getComputedStyle(heading);
      const available =
        heading.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);

      if (available <= 0) return;

      // Measure at the normal size before shrinking, so wider cards can restore it.
      text.style.fontSize = styles.fontSize;

      let width = text.getBoundingClientRect().width;
      let fontSize = parseFloat(styles.fontSize);

      // Remeasure because variable fonts can change proportions at smaller sizes.
      for (let attempt = 0; width > available && attempt < 4; attempt += 1) {
        fontSize = Math.max(1, (fontSize * available) / width - 0.1);
        text.style.fontSize = `${fontSize}px`;
        width = text.getBoundingClientRect().width;
      }
    };
    const observer = new ResizeObserver(fit);

    fit();
    observer.observe(heading);
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener('loadingdone', fit);

    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [title]);

  return (
    <h3
      className="-mx-4 -mt-4 whitespace-nowrap p-4 text-center font-[family-name:var(--font-family-heading)] text-xl font-semibold uppercase leading-tight"
      ref={headingRef}
      style={style}
    >
      <Link
        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        href={href}
      >
        <span className="inline-block" ref={textRef}>
          {title}
        </span>
      </Link>
    </h3>
  );
}

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
  imagePriority = false,
  imageSizes = '(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 42rem) 33vw, (min-width: 24rem) 50vw, 100vw',
}: ProductCardProps) {
  const t = useTranslations('Components.ProductCard');
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const {
    title,
    image,
    href,
    price,
    showFeatures = [],
    descriptionHtml,
    showDescription,
    cardStyle,
  } = product;
  const hasImages = Boolean(image || product.images?.length);
  const description = descriptionHtml?.trim() || showDescription?.trim();
  const bodyStyle: CSSProperties & Record<'--price-dark-text' | '--price-dark-sale-text', string> =
    {
      backgroundImage:
        cardStyle?.bodyBackgroundTop || cardStyle?.bodyBackgroundBottom
          ? `linear-gradient(to top, ${cardStyle.bodyBackgroundBottom || 'transparent'}, ${cardStyle.bodyBackgroundTop || 'transparent'})`
          : undefined,
      color: cardStyle?.bodyText,
      '--price-dark-text': 'currentColor',
      '--price-dark-sale-text': 'currentColor',
    };

  return (
    <article
      className={clsx(
        'flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-gray-600 p-4 font-[family-name:var(--product-card-font-family,var(--font-family-body))] shadow-sm @container',
        layout === 'grid' && 'max-w-md',
        className,
      )}
      data-card-variant="fc-crate-quick-view"
      data-layout={layout}
      style={bodyStyle}
    >
      <CardTitle
        href={href}
        style={{ backgroundColor: cardStyle?.headerBackground, color: cardStyle?.headerText }}
        title={title}
      />
      <ProductImageCarousel
        imagePriority={imagePriority}
        imageSizes={imageSizes}
        key={product.id}
        paused={quickViewOpen}
        product={product}
      />
      <PriceLabel
        className="[&_abbr]:cursor-default [&_abbr]:no-underline"
        colorScheme="dark"
        price={price ?? t('callForPricing')}
      />
      <StockLevel product={product} />
      <Dialog.Root onOpenChange={setQuickViewOpen} open={quickViewOpen}>
        <div
          className="-mx-4 -mb-4 mt-auto p-4"
          style={{ backgroundColor: cardStyle?.footerBackground, color: cardStyle?.footerText }}
        >
          <Dialog.Trigger asChild>
            <Button
              className="w-full [--button-tertiary-background-hover:rgb(255_255_255/50%)]"
              shape="rounded"
              size="small"
              style={{
                backgroundColor: cardStyle?.buttonBackground,
                color: cardStyle?.buttonText ?? cardStyle?.footerText,
              }}
              variant="tertiary"
            >
              {t('quickView')}
              <span className="sr-only">: {title}</span>
            </Button>
          </Dialog.Trigger>
        </div>
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
                hasImages ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              <div className="flex min-w-0 flex-col items-start gap-4 pb-6">
                <Dialog.Title className="break-words font-[family-name:var(--font-family-heading)] text-2xl font-semibold">
                  {title}
                </Dialog.Title>
                <PriceLabel className="text-xl" price={price ?? t('callForPricing')} />
                <StockLevel product={product} />
              </div>
              {hasImages && (
                <div className="relative min-w-0 overflow-hidden rounded-lg">
                  <ProductImageCarousel
                    imagePriority
                    imageSizes="(min-width: 672px) 292px, calc((100vw - 96px) / 2)"
                    product={product}
                    variant="modal"
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
