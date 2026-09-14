import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { ResultOf } from 'gql.tada';

import { Product } from '@/vibes/soul/primitives/product-card';
import { ShowCrateProductCardFragment } from '~/components/product-card/show-crate-fragment';

type ShowCrateProduct = ResultOf<typeof ShowCrateProductCardFragment>;

export const isShowCrateProduct = (product: ShowCrateProduct): boolean =>
  removeEdgesAndNodes(product.showMetafields).some(
    ({ key, value }) => key === 'is_show' && value.trim().toLowerCase() === 'true',
  );

export function showCrateProductTransformer(
  product: ShowCrateProduct,
): Pick<Product, 'isShow' | 'showFeatures' | 'showDescription'> {
  const isShow = isShowCrateProduct(product);

  return {
    isShow,
    showDescription: isShow ? product.showDescription.trim() || undefined : undefined,
    showFeatures: isShow
      ? removeEdgesAndNodes(product.showCustomFields)
          .filter(({ value }) => value.trim() !== '')
          .map(({ entityId, name, value }) => ({
            id: entityId.toString(),
            name: name.trim(),
            value: value.trim(),
          }))
      : undefined,
  };
}
