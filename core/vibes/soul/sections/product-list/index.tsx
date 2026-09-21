'use client';

import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';

import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { ButtonLink } from '@/vibes/soul/primitives/button-link';
import {
  AddToCartForm,
  CompareAddToCartAction,
} from '@/vibes/soul/primitives/compare-card/add-to-cart-form';
import { CompareDrawer, CompareDrawerProvider } from '@/vibes/soul/primitives/compare-drawer';
import {
  type Product,
  ProductCard,
  ProductCardSkeleton,
} from '@/vibes/soul/primitives/product-card';
import * as Skeleton from '@/vibes/soul/primitives/skeleton';
import { Link } from '~/components/link';

import { useProductAttributesVisibility } from './attribute-visibility';
import { useProductView } from './view';

interface ProductListProps {
  addToCartAction?: CompareAddToCartAction;
  cartQuantities?: Streamable<Record<string, number>>;
  products: Streamable<Product[]>;
  showRating?: boolean;
  compareProducts?: Streamable<Product[]>;
  className?: string;
  colorScheme?: 'light' | 'dark';
  aspectRatio?: '5:6' | '3:4' | '1:1';
  showCompare?: Streamable<boolean>;
  compareHref?: string;
  compareLabel?: Streamable<string>;
  compareParamName?: string;
  emptyStateTitle?: Streamable<string>;
  emptyStateSubtitle?: Streamable<string>;
  placeholderCount?: number;
  removeLabel?: Streamable<string>;
  maxItems?: number;
  maxCompareLimitMessage?: Streamable<string>;
}

// eslint-disable-next-line valid-jsdoc
/**
 * This component supports various CSS variables for theming. Here's a comprehensive list, along
 * with their default values:
 *
 * ```css
 * :root {
 *   --product-list-light-empty-title: hsl(var(--foreground));
 *   --product-list-light-empty-subtitle: hsl(var(--contrast-500));
 *   --product-list-dark-empty-title: hsl(var(--background));
 *   --product-list-dark-empty-subtitle: hsl(var(--contrast-100));
 *   --product-list-empty-state-title-font-family: var(--font-family-heading);
 *   --product-list-empty-state-subtitle-font-family: var(--font-family-body);
 * }
 * ```
 */
export function ProductList({
  addToCartAction,
  cartQuantities,
  products: streamableProducts,
  showRating,
  className,
  colorScheme = 'light',
  aspectRatio = '5:6',
  showCompare: streamableShowCompare = true,
  compareHref,
  compareProducts: streamableCompareProducts = [],
  compareLabel: streamableCompareLabel = 'Compare',
  compareParamName = 'compare',
  emptyStateTitle = 'No products found',
  emptyStateSubtitle = 'Try browsing our complete catalog of products.',
  placeholderCount = 8,
  removeLabel: streamableRemoveLabel,
  maxItems,
  maxCompareLimitMessage: streamableMaxCompareLimitMessage,
}: ProductListProps) {
  const view = useProductView();
  const showAttributes = useProductAttributesVisibility();
  const t = useTranslations('Compare');
  const tProduct = useTranslations('Product.ProductDetails.Submit');
  const tQuantity = useTranslations('Product.ProductDetails');

  return (
    <Stream
      fallback={<ProductListSkeleton placeholderCount={placeholderCount} />}
      value={Streamable.all([
        streamableProducts,
        streamableCompareLabel,
        streamableShowCompare,
        streamableCompareProducts,
        streamableRemoveLabel,
        streamableMaxCompareLimitMessage,
      ])}
    >
      {([
        products,
        compareLabel,
        showCompare,
        compareProducts,
        removeLabel,
        maxCompareLimitMessage,
      ]) => {
        if (products.length === 0) {
          return (
            <ProductListEmptyState
              emptyStateSubtitle={emptyStateSubtitle}
              emptyStateTitle={emptyStateTitle}
              placeholderCount={placeholderCount}
            />
          );
        }

        const visibleProducts = products.map((product) =>
          showAttributes || product.enhancedGridAttributes === undefined
            ? product
            : { ...product, attributes: undefined, enhancedGridAttributes: undefined },
        );
        const gridColumns = visibleProducts.some(
          (product) => product.enhancedGridAttributes !== undefined,
        )
          ? 'gap-4 @4xl:grid-cols-2 @7xl:grid-cols-3'
          : 'gap-x-4 gap-y-6 @sm:grid-cols-2 @2xl:grid-cols-3 @2xl:gap-x-5 @2xl:gap-y-8 @5xl:grid-cols-4 @7xl:grid-cols-5';

        return (
          <CompareDrawerProvider
            items={compareProducts}
            maxCompareLimitMessage={maxCompareLimitMessage}
            maxItems={maxItems}
          >
            <div className={clsx('w-full @container', className)}>
              <div
                className={clsx(
                  'mx-auto grid grid-cols-1',
                  view === 'grid' ? gridColumns : 'gap-4',
                )}
              >
                {visibleProducts.map((product) => (
                  <ProductCard
                    aspectRatio={aspectRatio}
                    colorScheme={colorScheme}
                    compareLabel={compareLabel}
                    compareParamName={compareParamName}
                    imageSizes={
                      view === 'list'
                        ? '70px'
                        : '(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 42rem) 33vw, (min-width: 24rem) 50vw, 100vw'
                    }
                    key={product.id}
                    layout={view}
                    product={product}
                    purchaseAction={
                      (view === 'list' || product.enhancedGridAttributes !== undefined) &&
                      addToCartAction &&
                      (product.hasOptions === false ? (
                        <AddToCartForm
                          addToCartAction={addToCartAction}
                          addToCartLabel={t('addToCart')}
                          cartQuantityLink={
                            cartQuantities !== undefined && (
                              <Stream fallback={null} value={cartQuantities}>
                                {(quantities) => {
                                  const quantity = quantities[product.id] ?? 0;

                                  return quantity > 0 ? (
                                    <div aria-live="polite" className="w-full text-center text-xs">
                                      <Link className="underline underline-offset-2" href="/cart">
                                        {tQuantity('quantityInCart', { quantity })}
                                      </Link>
                                    </div>
                                  ) : null;
                                }}
                              </Stream>
                            )
                          }
                          decrementLabel={tQuantity('decreaseQuantity')}
                          disabled={product.canAddToCart === false}
                          incrementLabel={tQuantity('increaseQuantity')}
                          isPreorder={product.isPreorder}
                          maxQuantity={product.maxQuantity}
                          minQuantity={product.minQuantity}
                          preorderLabel={tProduct('preorder')}
                          productId={product.id}
                          quantityLabel={tQuantity('quantity')}
                          showQuantity
                          size="x-small"
                        />
                      ) : (
                        <ButtonLink href={product.href} size="x-small">
                          {t('viewOptions')}
                        </ButtonLink>
                      ))
                    }
                    showCompare={showCompare}
                    showRating={showRating}
                  />
                ))}
              </div>
            </div>
            {showCompare && compareProducts.length > 0 && (
              <CompareDrawer
                href={compareHref}
                paramName={compareParamName}
                removeLabel={removeLabel}
                submitLabel={compareLabel}
              />
            )}
          </CompareDrawerProvider>
        );
      }}
    </Stream>
  );
}

export function ProductListSkeleton({
  className,
  placeholderCount = 8,
}: Pick<ProductListProps, 'className' | 'placeholderCount'>) {
  const view = useProductView();

  return (
    <Skeleton.Root
      className={clsx('group-has-data-pending/product-list:animate-pulse', className)}
      pending
    >
      <div
        className={clsx(
          'mx-auto grid grid-cols-1',
          view === 'grid'
            ? 'gap-x-4 gap-y-6 @sm:grid-cols-2 @2xl:grid-cols-3 @2xl:gap-x-5 @2xl:gap-y-8 @5xl:grid-cols-4 @7xl:grid-cols-5'
            : 'gap-4',
        )}
      >
        {Array.from({ length: placeholderCount }).map((_, index) => (
          <ProductCardSkeleton key={index} layout={view} />
        ))}
      </div>
    </Skeleton.Root>
  );
}

export function ProductListEmptyState({
  className,
  placeholderCount = 8,
  emptyStateTitle,
  emptyStateSubtitle,
}: Pick<
  ProductListProps,
  'className' | 'placeholderCount' | 'emptyStateTitle' | 'emptyStateSubtitle'
>) {
  return (
    <Skeleton.Root className={clsx('relative', className)}>
      <div
        className={clsx(
          'mx-auto grid grid-cols-1 gap-x-4 gap-y-6 [mask-image:linear-gradient(to_bottom,_black_0%,_transparent_90%)] @sm:grid-cols-2 @2xl:grid-cols-3 @2xl:gap-x-5 @2xl:gap-y-8 @5xl:grid-cols-4 @7xl:grid-cols-5',
        )}
      >
        {Array.from({ length: placeholderCount }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
      <div className="absolute inset-0 mx-auto px-3 py-16 pb-3 @4xl:px-10 @4xl:pb-10 @4xl:pt-28">
        <div className="mx-auto max-w-xl space-y-2 text-center @4xl:space-y-3">
          <h3 className="font-[family-name:var(--product-list-empty-state-title-font-family,var(--font-family-heading))] text-2xl leading-tight text-[var(--product-list-empty-state-title,hsl(var(--foreground)))] @4xl:text-4xl @4xl:leading-none">
            {emptyStateTitle}
          </h3>
          <p className="font-[family-name:var(--product-list-empty-state-subtitle-font-family,var(--font-family-body))] text-sm text-[var(--product-list-empty-state-subtitle,hsl(var(--contrast-500)))] @4xl:text-lg">
            {emptyStateSubtitle}
          </p>
        </div>
      </div>
    </Skeleton.Root>
  );
}
