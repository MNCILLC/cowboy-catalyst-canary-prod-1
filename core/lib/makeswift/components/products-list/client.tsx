'use client';

import { ComponentPropsWithoutRef } from 'react';
import useSWR from 'swr';
import { z } from 'zod';

import { ProductList, ProductListSkeleton } from '@/vibes/soul/sections/product-list';
import { WholesalePricingAlertPresentation } from '~/components/wholesale-pricing-alert/presentation';

import { useProducts } from '../../utils/use-products';

type MSProductsListProps = Omit<ComponentPropsWithoutRef<typeof ProductList>, 'products'> & {
  className: string;
  collection: 'none' | 'best-selling' | 'newest' | 'featured';
  limit: number;
  additionalProducts: Array<{
    entityId?: string;
  }>;
  showWholesalePricingBanner: boolean;
};

const WholesalePricingBannerSchema = z.object({ showBanner: z.boolean() });

const fetchWholesalePricingBanner = (url: string) =>
  fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return WholesalePricingBannerSchema.parse(await response.json());
  });

export function MSProductsList({
  className,
  collection,
  limit,
  additionalProducts,
  showWholesalePricingBanner = true,
  ...props
}: MSProductsListProps) {
  const additionalProductIds = additionalProducts.map(({ entityId }) => entityId ?? '');
  const { products, isLoading } = useProducts({
    collection,
    collectionLimit: limit,
    additionalProductIds,
  });
  const { data: wholesalePricing } = useSWR(
    showWholesalePricingBanner ? '/api/wholesale-pricing' : null,
    fetchWholesalePricingBanner,
  );

  if (isLoading) {
    return <ProductListSkeleton className={className} />;
  }

  if (products == null || products.length === 0) {
    return <ProductListSkeleton className={className} />;
  }

  return (
    <div className={className}>
      <div className="flex w-full flex-col">
        {wholesalePricing?.showBanner && <WholesalePricingAlertPresentation className="mb-6" />}
        <ProductList {...props} className="w-full" products={products} />
      </div>
    </div>
  );
}
