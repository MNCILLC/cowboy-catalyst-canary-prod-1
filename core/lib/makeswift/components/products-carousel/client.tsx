'use client';

import { ComponentPropsWithoutRef } from 'react';

import { ProductCarousel, ProductsCarouselSkeleton } from '@/vibes/soul/sections/product-carousel';
import { WholesalePricingAlertPresentation } from '~/components/wholesale-pricing-alert/presentation';
import { useWholesalePricingBannerVisibility } from '~/components/wholesale-pricing-alert/use-visibility';

import { useProducts } from '../../utils/use-products';

type MSProductsCarouselProps = Omit<
  ComponentPropsWithoutRef<typeof ProductCarousel>,
  'products'
> & {
  className: string;
  collection: 'none' | 'best-selling' | 'newest' | 'featured';
  limit: number;
  additionalProducts: Array<{
    entityId?: string;
  }>;
  showWholesalePricingBanner: boolean;
};

export function MSProductsCarousel({
  className,
  collection,
  limit,
  additionalProducts,
  hideOverflow,
  showWholesalePricingBanner = true,
  ...props
}: MSProductsCarouselProps) {
  const additionalProductIds = additionalProducts.map(({ entityId }) => entityId ?? '');
  const { products, isLoading } = useProducts({
    collection,
    collectionLimit: limit,
    additionalProductIds,
  });
  const showBanner = useWholesalePricingBannerVisibility(showWholesalePricingBanner);

  if (isLoading) {
    return <ProductsCarouselSkeleton className={className} hideOverflow={hideOverflow} />;
  }

  if (products == null || products.length === 0) {
    return <ProductsCarouselSkeleton className={className} hideOverflow={hideOverflow} />;
  }

  return (
    <div className={className}>
      <div className="flex w-full flex-col">
        {showBanner && <WholesalePricingAlertPresentation className="mb-6" />}
        <ProductCarousel
          {...props}
          className="w-full"
          hideOverflow={hideOverflow}
          products={products}
        />
      </div>
    </div>
  );
}
