import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import useSWR from 'swr';
import { z } from 'zod';

import { hasZeroPrice } from '~/data-transformers/prices-transformer';
import { isShowCrateProduct } from '~/data-transformers/show-crate-product-transformer';
import { useRecentlyViewed } from '~/lib/recently-viewed/use-recently-viewed';

import {
  BcProductSchema,
  Product,
  useBcProductToVibesProduct,
} from './use-bc-product-to-vibes-product/use-bc-product-to-vibes-product';

const ProductListSchema = z.object({
  products: z.array(BcProductSchema),
});

const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) throw new Error('Unable to load products.');

  const result = ProductListSchema.safeParse(await response.json());

  if (!result.success) throw new Error('Unable to load products.');

  return result.data;
};

interface Props {
  collection: 'none' | 'best-selling' | 'newest' | 'featured' | 'category' | 'recently-viewed';
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
  hasError: boolean;
} {
  const bcProductToVibesProduct = useBcProductToVibesProduct(
    showStockLevel,
    collection === 'category' && categoryId ? Number(categoryId) : undefined,
  );
  const locale = useLocale();
  const recentIds = useRecentlyViewed(collection === 'recently-viewed');
  const productIds = collection === 'recently-viewed' ? recentIds : additionalProductIds;
  const collectionParams = new URLSearchParams({
    locale,
    limit: String(Math.min(50, Math.max(1, Math.floor(collectionLimit) || 20))),
  });

  if (collection === 'category' && categoryId) collectionParams.set('categoryId', categoryId);

  const hasCollection =
    collection !== 'recently-viewed' &&
    collection !== 'none' &&
    (collection !== 'category' || Boolean(categoryId));

  const {
    data: collectionData,
    isLoading: isCollectionLoading,
    error: collectionError,
  } = useSWR<z.infer<typeof ProductListSchema>, Error>(
    hasCollection ? `/api/products/group/${collection}?${collectionParams.toString()}` : null,
    fetcher,
  );

  const searchParams = new URLSearchParams();

  searchParams.append('ids', productIds.join(','));
  searchParams.append('locale', locale);

  const additionalProductsUrl = `/api/products/ids?${searchParams.toString()}`;

  const {
    data: additionalData,
    isLoading: isAdditionalLoading,
    error: additionalError,
  } = useSWR<z.infer<typeof ProductListSchema>, Error>(
    productIds.length ? additionalProductsUrl : null,
    fetcher,
  );
  const additionalProducts = useMemo(
    () =>
      productIds
        .map((id) => additionalData?.products.find((product) => product.entityId.toString() === id))
        .filter((product) => product != null),
    [additionalData, productIds],
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
            .slice(0, collection === 'recently-viewed' ? collectionLimit : undefined)
            .map(bcProductToVibesProduct),
    [isLoading, combinedProducts, bcProductToVibesProduct, collection, collectionLimit],
  );

  return { products, isLoading, hasError: Boolean(collectionError || additionalError) };
}
