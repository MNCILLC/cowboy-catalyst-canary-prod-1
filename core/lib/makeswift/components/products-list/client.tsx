'use client';

import { useTranslations } from 'next-intl';
import { ComponentPropsWithoutRef } from 'react';

import { ProductList, ProductListSkeleton } from '@/vibes/soul/sections/product-list';
import { WholesalePricingAlertPresentation } from '~/components/wholesale-pricing-alert/presentation';
import { useWholesalePricingBannerVisibility } from '~/components/wholesale-pricing-alert/use-visibility';

import { useProducts } from '../../utils/use-products';

type MSProductsListProps = Omit<ComponentPropsWithoutRef<typeof ProductList>, 'products'> & {
  className: string;
  collection: 'none' | 'best-selling' | 'newest' | 'featured' | 'recently-viewed';
  limit: number;
  additionalProducts: Array<{
    entityId?: string;
  }>;
  showWholesalePricingBanner: boolean;
};

export function MSProductsList({
  className,
  collection,
  limit,
  additionalProducts = [],
  showWholesalePricingBanner = true,
  ...props
}: MSProductsListProps) {
  const additionalProductIds = additionalProducts.map(({ entityId }) => entityId ?? '');
  const t = useTranslations('ProductCollections');
  const { products, isLoading, hasError } = useProducts({
    collection,
    collectionLimit: limit,
    additionalProductIds,
  });
  const showBanner = useWholesalePricingBannerVisibility(showWholesalePricingBanner);

  if (isLoading) {
    return <ProductListSkeleton className={className} />;
  }

  if (hasError) {
    return (
      <p className={className} role="alert">
        {t('error')}
      </p>
    );
  }

  if (products == null || products.length === 0) {
    return (
      <p className={className}>
        {t(collection === 'recently-viewed' ? 'recentlyViewedEmpty' : 'empty')}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="flex w-full flex-col">
        {showBanner && <WholesalePricingAlertPresentation className="mb-6" />}
        <ProductList {...props} className="w-full" products={products} />
      </div>
    </div>
  );
}
