import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import useSWR from 'swr';
import { z } from 'zod';

import { hasZeroPrice } from '~/data-transformers/prices-transformer';
import { isShowCrateProduct } from '~/data-transformers/show-crate-product-transformer';

import {
  BcProductSchema,
  Product,
  useBcProductToVibesProduct,
} from './use-bc-product-to-vibes-product/use-bc-product-to-vibes-product';

const ProductListSchema = z.object({
  products: z.array(BcProductSchema),
});

const fetcher = (url: string) =>
  fetch(url)
    .then((res) => res.json())
    .then(ProductListSchema.parse);

interface Props {
  collection: 'none' | 'best-selling' | 'newest' | 'featured' | 'category';
  categoryId?: string;
  showStockLevel?: boolean;
  collectionLimit?: number;
  additionalProductIds: string[];
}

export function useProducts({
  collection,
  categoryId,
  collectionLimit = 20,
  showStockLevel = false,
  additionalProductIds,
}: Props): {
  products: Product[] | null;
  isLoading: boolean;
} {
  const bcProductToVibesProduct = useBcProductToVibesProduct(
    showStockLevel,
    collection === 'category' && categoryId ? Number(categoryId) : undefined,
  );
  const locale = useLocale();
  const collectionParams = new URLSearchParams({
    locale,
    limit: String(Math.min(50, Math.max(1, Math.floor(collectionLimit) || 20))),
  });

  if (collection === 'category' && categoryId) collectionParams.set('categoryId', categoryId);

  const hasCollection = collection !== 'none' && (collection !== 'category' || Boolean(categoryId));

  const { data: collectionData, isLoading: isCollectionLoading } = useSWR(
    hasCollection ? `/api/products/group/${collection}?${collectionParams.toString()}` : null,
    fetcher,
  );

  const searchParams = new URLSearchParams();

  searchParams.append('ids', additionalProductIds.join(','));
  searchParams.append('locale', locale);

  const additionalProductsUrl = `/api/products/ids?${searchParams.toString()}`;

  const { data: additionalData, isLoading: isAdditionalLoading } = useSWR(
    additionalProductIds.length ? additionalProductsUrl : null,
    fetcher,
  );
  const additionalProducts = useMemo(
    () =>
      additionalProductIds
        .map((id) => additionalData?.products.find((product) => product.entityId.toString() === id))
        .filter((product) => product != null),
    [additionalData, additionalProductIds],
  );

  const combinedProducts = useMemo(
    () => [...(collectionData?.products.slice(0, collectionLimit) ?? []), ...additionalProducts],
    [collectionData, additionalProducts, collectionLimit],
  );

  const isLoading = isCollectionLoading || isAdditionalLoading;

  const products = useMemo(
    () =>
      isLoading
        ? null
        : combinedProducts
            .filter((product) => isShowCrateProduct(product) || !hasZeroPrice(product))
            .map(bcProductToVibesProduct),
    [isLoading, combinedProducts, bcProductToVibesProduct],
  );

  return { products, isLoading };
}
