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
  const configuredFieldNames = removeEdgesAndNodes(product.showMetafields).find(
    ({ key }) => key === 'product_card_custom_fields',
  )?.value;
  const fieldNames = [
    ...new Set(
      (configuredFieldNames ?? '')
        .split(';')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const customFields = removeEdgesAndNodes(product.showCustomFields);

  return {
    isShow,
    showDescription: isShow ? product.showDescription.trim() || undefined : undefined,
    showFeatures: isShow
      ? fieldNames.flatMap((name) =>
          customFields
            .filter((field) => field.name.trim() === name && field.value.trim() !== '')
            .map(({ entityId, value }) => ({
              id: entityId.toString(),
              value: value.trim(),
            })),
        )
      : undefined,
  };
}
