import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { ResultOf } from 'gql.tada';

import { Product } from '@/vibes/soul/primitives/product-card';
import { ShowCrateProductCardFragment } from '~/components/product-card/show-crate-fragment';

type ShowCrateProduct = ResultOf<typeof ShowCrateProductCardFragment>;

export const isShowCrateProduct = (product: ShowCrateProduct): boolean =>
  removeEdgesAndNodes(product.showMetafields).some(
    ({ key, value }) => key === 'is_show' && value.trim().toLowerCase() === 'true',
  );

export function getShowCrateCustomFieldNames(product: ShowCrateProduct): string[] {
  const configuredFieldNames = removeEdgesAndNodes(product.showMetafields).find(
    ({ key }) => key === 'product_card_custom_fields',
  )?.value;

  return [
    ...new Set(
      (configuredFieldNames ?? '')
        .split(';')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
}

export function showCrateProductTransformer(
  product: ShowCrateProduct,
): Pick<Product, 'isShow' | 'showName' | 'showFeatures' | 'showDescription' | 'images'> {
  const isShow = isShowCrateProduct(product);
  const fieldNames = getShowCrateCustomFieldNames(product);
  const customFields = removeEdgesAndNodes(product.showCustomFields);

  return {
    isShow,
    images: isShow
      ? removeEdgesAndNodes(product.cardImages).map(({ url, altText }) => ({
          src: url,
          alt: altText,
        }))
      : undefined,
    showName: isShow
      ? customFields.find(({ name }) => name.trim() === 'Show Name')?.value.trim() || undefined
      : undefined,
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
