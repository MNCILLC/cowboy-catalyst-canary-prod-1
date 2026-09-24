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
  categoryId?: number,
): Pick<
  Product,
  'isShow' | 'showName' | 'showFeatures' | 'showDescription' | 'images' | 'cardStyle'
> {
  const isShow = isShowCrateProduct(product);
  const fieldNames = getShowCrateCustomFieldNames(product);
  const customFields = removeEdgesAndNodes(product.showCustomFields);
  // Choose one category's settings, rather than mixing colors from different categories.
  // Stable ID order makes the fallback consistent across catalog and Makeswift queries.
  const configuredCategories = removeEdgesAndNodes(product.cardStyleCategories)
    .sort((a, b) => a.entityId - b.entityId)
    .filter((category) =>
      removeEdgesAndNodes(category.cardStyleMetafields).some(({ value }) => value.trim()),
    );
  const styleCategory =
    configuredCategories.find((category) => category.entityId === categoryId) ??
    configuredCategories[0];
  const styleFields = styleCategory ? removeEdgesAndNodes(styleCategory.cardStyleMetafields) : [];
  const color = (key: string) =>
    styleFields.find((field) => field.key === key)?.value.trim() || undefined;

  return {
    isShow,
    cardStyle:
      isShow && styleCategory
        ? {
            headerBackground: color('card_header_bg_color'),
            headerText: color('card_header_text_color'),
            footerBackground: color('card_footer_bg_color'),
            footerText: color('card_footer_text_color'),
            buttonBackground: color('card_footer_button_bg_color'),
            buttonText: color('card_footer_button_text_color'),
            bodyBackgroundTop: color('card_body_bg_color_top'),
            bodyBackgroundBottom: color('card_body_bg_color_bottom'),
            bodyText: color('card_body_text_color'),
          }
        : undefined,
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
