import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import {
  Content as CalloutContent,
  Description as CalloutDescription,
  Header as CalloutHeader,
  Root as CalloutRoot,
  Title as CalloutTitle,
} from 'storefront-kit/callout';

import { Badge } from '@/vibes/soul/primitives/badge';
import { EnhancedStockLevel } from '@/vibes/soul/primitives/enhanced-stock-level';
import { Price, PriceLabel } from '@/vibes/soul/primitives/price-label';
import * as Skeleton from '@/vibes/soul/primitives/skeleton';
import { Image } from '~/components/image';
import { Link } from '~/components/link';

import { Rating } from '../rating';
import { ShowCrateProductCard } from '../show-crate-product-card';

import { ProductCardAttributes } from './attributes';
import { Compare } from './compare';
import { ProductCardDescription } from './description';

export interface Product {
  isShow?: boolean;
  showName?: string;
  showDescription?: string;
  showFeatures?: Array<{ id: string; value: string }>;
  id: string;
  title: string;
  listViewDescription?: string;
  descriptionHtml?: string;
  attributes?: Array<{
    key: string;
    label: string;
    values: Array<{ value: string; label: string; swatchColor?: string }>;
  }>;
  href: string;
  image?: { src: string; alt: string };
  price?: Price;
  subtitle?: string;
  badge?: string;
  rating?: number;
  inventoryMessage?: string;
  useEnhancedStockDisplay?: boolean;
  stockDisplayData?: {
    stockLevelMessage: string;
    stockLevelStatus?: 'error' | 'success';
    backorderAvailabilityPrompt: string | null;
  } | null;
  numberOfReviews?: number;
  promotions?: Array<{ id: string; text: string }>;
  hasOptions?: boolean;
  canAddToCart?: boolean;
  isPreorder?: boolean;
  minQuantity?: number;
  maxQuantity?: number;
}

export interface ProductCardProps {
  layout?: 'grid' | 'list';
  purchaseAction?: ReactNode;
  className?: string;
  colorScheme?: 'light' | 'dark';
  aspectRatio?: '5:6' | '3:4' | '1:1';
  showCompare?: boolean;
  imagePriority?: boolean;
  imageSizes?: string;
  compareLabel?: string;
  compareParamName?: string;
  product: Product;
  showRating?: boolean;
  showStockLevel?: boolean;
}

// eslint-disable-next-line valid-jsdoc
/**
 * This component supports various CSS variables for theming. Here's a comprehensive list, along
 * with their default values:
 *
 * ```css
 * :root {
 *   --product-card-focus: hsl(var(--primary));
 *   --product-card-light-offset: hsl(var(--background));
 *   --product-card-light-background: hsl(var(--contrast-100));
 *   --product-card-light-title: hsl(var(--foreground));
 *   --product-card-light-subtitle: hsl(var(--foreground) / 75%);
 *   --product-card-light-message: hsl(var(--foreground) / 75%);
 *   --product-card-dark-offset: hsl(var(--foreground));
 *   --product-card-dark-background: hsl(var(--contrast-500));
 *   --product-card-dark-title: hsl(var(--background));
 *   --product-card-dark-subtitle: hsl(var(--background) / 75%);
 *   --product-card-dark-message: hsl(var(--background) / 75%);
 *   --product-card-font-family: var(--font-family-body);
 * }
 * ```
 */
export function ProductCard(props: ProductCardProps) {
  if (props.product.isShow) {
    return <ShowCrateProductCard {...props} />;
  }

  return <StandardProductCard {...props} />;
}

function StandardProductCard({
  product: {
    id,
    title,
    listViewDescription,
    attributes,
    subtitle,
    badge,
    price,
    image,
    href,
    inventoryMessage,
    useEnhancedStockDisplay,
    stockDisplayData,
    rating,
    numberOfReviews,
    promotions,
  },
  showRating = false,
  showStockLevel = false,
  layout = 'grid',
  purchaseAction,
  colorScheme = 'light',
  className,
  showCompare = false,
  aspectRatio = '5:6',
  compareLabel,
  compareParamName,
  imagePriority = false,
  imageSizes = '(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 42rem) 33vw, (min-width: 24rem) 50vw, 100vw',
}: ProductCardProps) {
  const t = useTranslations('Components.ProductCard');
  const layoutStyles = {
    grid: {
      root: 'max-w-md flex-col gap-3',
      content: '',
      imageColumn: '',
      image: clsx(
        'rounded-xl @md:rounded-2xl',
        { '5:6': 'aspect-[5/6]', '3:4': 'aspect-[3/4]', '1:1': 'aspect-square' }[aspectRatio],
        {
          light: 'bg-[var(--product-card-light-background,hsl(var(--contrast-100)))]',
          dark: 'bg-[var(--product-card-dark-background,hsl(var(--contrast-500)))]',
        }[colorScheme],
      ),
      imageFit: 'object-cover',
      placeholder: 'pl-5 pt-5 text-4xl leading-[0.8] @xs:text-7xl',
      details: 'mt-2 px-1 @xs:mt-3 @2xl:flex-row',
      detailsContent: '',
      titleRow: '',
      title: '',
      descriptionRow: '',
      actions: 'ml-1 mt-auto',
      compare: '',
      badge: 'absolute left-3 top-3',
    },
    list: {
      root: clsx(
        'relative max-w-none flex-col gap-3 rounded-2xl border border-contrast-100 p-4 shadow-sm @lg:flex-row @lg:items-start @lg:gap-6',
        {
          light: 'bg-[var(--card-light-background,hsl(var(--contrast-100)))]',
          dark: 'bg-[var(--card-dark-background,hsl(var(--contrast-500)))]',
        }[colorScheme],
      ),
      content:
        'grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-4 @lg:self-stretch',
      imageColumn: 'flex flex-col items-start gap-3',
      image: 'aspect-square w-16 @lg:w-24',
      imageFit: 'object-contain',
      placeholder: 'p-2 text-sm',
      details: 'min-h-0 min-w-0 self-stretch',
      detailsContent: 'flex min-h-0 w-full flex-col',
      titleRow: 'grid grid-cols-2 items-start gap-x-4 gap-y-2 @lg:grid-cols-3',
      title: 'col-span-2 min-w-0 @lg:col-span-1',
      descriptionRow: 'flex flex-col gap-x-4 @lg:flex-row @lg:items-start',
      actions: 'relative z-10 ml-auto mt-2 flex flex-col items-end gap-3',
      compare: 'relative z-10 w-fit',
      badge: 'mb-1 self-start',
    },
  }[layout];
  const badgeElement =
    badge != null && badge !== '' ? (
      <Badge className={layoutStyles.badge} shape="rounded">
        {badge}
      </Badge>
    ) : null;

  const inventory = (
    <ProductCardInventory
      colorScheme={colorScheme}
      inventoryMessage={inventoryMessage}
      layout={layout}
      showStockLevel={showStockLevel}
      stockDisplayData={stockDisplayData}
      useEnhancedStockDisplay={useEnhancedStockDisplay}
    />
  );
  const priceElement = price != null && (
    <PriceLabel
      className="[&_abbr]:cursor-default [&_abbr]:no-underline"
      colorScheme={colorScheme}
      price={price}
    />
  );
  const compareElement = showCompare && (
    <div className={layoutStyles.compare}>
      <Compare
        colorScheme={colorScheme}
        label={compareLabel}
        paramName={compareParamName}
        product={{ id, title, href, image }}
      />
    </div>
  );
  const controlPlacement = {
    grid: {
      compareImage: null,
      compareActions: compareElement,
      priceDetails: priceElement,
      inventoryDetails: inventory,
      headerDetails: null,
    },
    list: {
      compareImage: compareElement,
      compareActions: null,
      priceDetails: null,
      inventoryDetails: null,
      headerDetails: (
        <>
          <div className="min-w-0 @lg:justify-self-center">{inventory}</div>
          <div className="min-w-0 text-right">{priceElement}</div>
        </>
      ),
    },
  }[layout];

  const actionsElement = [purchaseAction, controlPlacement.compareActions].some(Boolean) && (
    <div className={clsx('shrink-0', layoutStyles.actions)}>
      {purchaseAction}
      {controlPlacement.compareActions}
    </div>
  );
  const actionsPlacement = {
    grid: { details: null, outside: actionsElement },
    list: { details: actionsElement, outside: null },
  }[layout];

  return (
    <article
      className={clsx(
        'group flex min-w-0 font-[family-name:var(--card-font-family,var(--font-family-body))] @container',
        layoutStyles.root,
        className,
      )}
      data-layout={layout}
    >
      <div className={clsx('relative', layoutStyles.content)}>
        <div className={layoutStyles.imageColumn}>
          <div className={clsx('relative overflow-hidden', layoutStyles.image)}>
            {image != null ? (
              <Image
                alt={image.alt}
                className={clsx(
                  'w-full scale-100 select-none transition-transform duration-500 ease-out group-hover:scale-110',
                  layoutStyles.imageFit,
                )}
                fill
                preload={imagePriority}
                sizes={imageSizes}
                src={image.src}
              />
            ) : (
              <div
                className={clsx(
                  'break-words font-bold tracking-tighter opacity-25 transition-transform duration-500 ease-out group-hover:scale-105',
                  layoutStyles.placeholder,
                  {
                    light: 'text-[var(--product-card-light-title,hsl(var(--foreground)))]',
                    dark: 'text-[var(--product-card-dark-title,hsl(var(--background)))]',
                  }[colorScheme],
                )}
              >
                {title}
              </div>
            )}
            {layout === 'grid' && badgeElement}
          </div>
          {controlPlacement.compareImage}
        </div>

        <div className={clsx('flex flex-col items-start gap-x-4 gap-y-3', layoutStyles.details)}>
          <div
            className={clsx(
              'min-w-0 flex-1 text-sm @[16rem]:text-base',
              layoutStyles.detailsContent,
            )}
          >
            {layout === 'list' && badgeElement}
            <div className={layoutStyles.titleRow}>
              <span
                className={clsx(
                  'line-clamp-2 font-semibold',
                  layoutStyles.title,
                  {
                    light: 'text-[var(--product-card-light-title,hsl(var(--foreground)))]',
                    dark: 'text-[var(--product-card-dark-title,hsl(var(--background)))]',
                  }[colorScheme],
                )}
              >
                {title}
              </span>
              {controlPlacement.headerDetails}
            </div>
            <div className={layoutStyles.descriptionRow}>
              <ProductCardDescription
                colorScheme={colorScheme}
                layout={layout}
                listViewDescription={listViewDescription}
              />
              {actionsPlacement.details}
            </div>
            <ProductCardBadges layout={layout} subtitle={subtitle} />
            {layout === 'grid' && subtitle != null && subtitle !== '' && (
              <span
                className={clsx(
                  'mb-1.5 block text-sm font-normal',
                  {
                    light: 'text-[var(--product-card-light-subtitle,hsl(var(--foreground)/75%))]',
                    dark: 'text-[var(--product-card-dark-subtitle,hsl(var(--background)/75%))]',
                  }[colorScheme],
                )}
              >
                {subtitle}
              </span>
            )}
            {controlPlacement.priceDetails}
            {promotions != null && promotions.length > 0 && (
              <div className="mt-1.5">
                <CalloutRoot size="small" variant="warning">
                  <CalloutContent>
                    <CalloutHeader>
                      <CalloutTitle>{promotions[0]?.text ?? ''}</CalloutTitle>
                      {promotions.length > 1 && (
                        <CalloutDescription>
                          {t('moreOffers', { count: promotions.length - 1 })}
                        </CalloutDescription>
                      )}
                    </CalloutHeader>
                  </CalloutContent>
                </CalloutRoot>
              </div>
            )}
            {showRating && typeof rating === 'number' && rating > 0 && (
              <Rating className="mb-2 mt-1" numberOfReviews={numberOfReviews} rating={rating} />
            )}
            {controlPlacement.inventoryDetails}
          </div>
        </div>
        <ProductCardAttributes attributes={attributes} layout={layout} />
        {href !== '#' && (
          <Link
            aria-label={title}
            className={clsx(
              'absolute inset-0 rounded-b-lg rounded-t-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--product-card-focus,hsl(var(--primary)))] focus-visible:ring-offset-4',
              {
                light: 'ring-offset-[var(--product-card-light-offset,hsl(var(--background)))]',
                dark: 'ring-offset-[var(--product-card-dark-offset,hsl(var(--foreground)))]',
              }[colorScheme],
            )}
            href={href}
            id={id}
          >
            <span className="sr-only">View product</span>
          </Link>
        )}
      </div>
      {actionsPlacement.outside}
    </article>
  );
}

function ProductCardBadges({
  layout,
  subtitle,
}: Pick<Product, 'subtitle'> & Required<Pick<ProductCardProps, 'layout'>>) {
  if (layout !== 'list' || !subtitle?.trim()) return null;

  return (
    <div className="my-1.5 flex flex-wrap gap-2">
      <Badge variant="info">{subtitle}</Badge>
    </div>
  );
}

function ProductCardInventory({
  colorScheme,
  showStockLevel,
  inventoryMessage,
  layout,
  stockDisplayData,
  useEnhancedStockDisplay,
}: Pick<Product, 'inventoryMessage' | 'stockDisplayData' | 'useEnhancedStockDisplay'> &
  Required<Pick<ProductCardProps, 'colorScheme' | 'layout' | 'showStockLevel'>>) {
  if (useEnhancedStockDisplay) {
    const stockMessage = stockDisplayData?.stockLevelMessage || inventoryMessage;

    return (
      <div className="space-y-1 text-sm">
        <EnhancedStockLevel message={stockMessage} status={stockDisplayData?.stockLevelStatus} />
        {!!stockDisplayData?.backorderAvailabilityPrompt && (
          <p className="opacity-75">{stockDisplayData.backorderAvailabilityPrompt}</p>
        )}
        {!!inventoryMessage && inventoryMessage !== stockMessage && (
          <p className="opacity-75">{inventoryMessage}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {(layout === 'list' || showStockLevel) && stockDisplayData && (
        <div
          className={clsx(
            'flex flex-wrap gap-x-2.5 gap-y-2 text-sm',
            {
              light: 'text-[var(--product-card-light-title,hsl(var(--foreground)))]',
              dark: 'text-[var(--product-card-dark-title,hsl(var(--background)))]',
            }[colorScheme],
          )}
        >
          <span
            className={clsx(
              'font-semibold',
              stockDisplayData.stockLevelStatus === 'error' && 'text-error',
            )}
          >
            {stockDisplayData.stockLevelMessage}
          </span>
          {!!stockDisplayData.backorderAvailabilityPrompt && (
            <span className="border-s border-contrast-100 pl-2.5">
              {stockDisplayData.backorderAvailabilityPrompt}
            </span>
          )}
        </div>
      )}
      <span
        className={clsx(
          'block text-sm font-normal',
          {
            light: 'text-[var(--product-card-light-message,hsl(var(--foreground)/75%))]',
            dark: 'text-[var(--product-card-dark-message,hsl(var(--background)/75%))]',
          }[colorScheme],
        )}
      >
        {(layout === 'list' || showStockLevel) &&
        inventoryMessage === stockDisplayData?.stockLevelMessage
          ? null
          : inventoryMessage}
      </span>
    </>
  );
}

export function ProductCardSkeleton({
  className,
  aspectRatio = '5:6',
  layout = 'grid',
}: Pick<ProductCardProps, 'className' | 'aspectRatio' | 'layout'>) {
  return (
    <Skeleton.Root
      className={clsx(
        layout === 'list' &&
          'flex items-start gap-4 rounded-2xl border border-contrast-100 bg-[var(--card-light-background,hsl(var(--contrast-100)))] p-4 shadow-sm',
        className,
      )}
    >
      <Skeleton.Box
        className={clsx(
          layout === 'grid' && 'rounded-[var(--product-card-border-radius,1rem)]',
          layout === 'list'
            ? 'aspect-square w-16 shrink-0 @lg:w-24'
            : {
                '5:6': 'aspect-[5/6]',
                '3:4': 'aspect-[3/4]',
                '1:1': 'aspect-square',
              }[aspectRatio],
        )}
      />
      <div
        className={clsx(
          'flex flex-col items-start gap-x-4 gap-y-3',
          layout === 'list' ? 'min-w-0 flex-1' : 'mt-2 px-1 @xs:mt-3 @2xl:flex-row',
        )}
      >
        <div className="w-full text-sm @[16rem]:text-base">
          <Skeleton.Text characterCount={10} className="rounded" />
          <Skeleton.Text characterCount={8} className="rounded" />
          <Skeleton.Text characterCount={6} className="rounded" />
        </div>
      </div>
      {layout === 'list' && <Skeleton.Box className="h-12 w-28 rounded-full" />}
    </Skeleton.Root>
  );
}
