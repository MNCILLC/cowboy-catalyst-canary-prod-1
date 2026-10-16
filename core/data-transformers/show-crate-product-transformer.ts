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
  const setting = (key: string) =>
    styleFields.find((field) => field.key === key)?.value.trim() || undefined;

  return {
    isShow,
    cardStyle:
      isShow && styleCategory
        ? {
            headerBackground: setting('card_header_bg_color'),
            headerText: setting('card_header_text_color'),
            footerBackground: setting('card_footer_bg_color'),
            footerText: setting('card_footer_text_color'),
            buttonBackground: setting('card_footer_button_bg_color'),
            buttonText: setting('card_footer_button_text_color'),
            buttonLabel: setting('card_footer_button_text'),
            bodyBackgroundTop: setting('card_body_bg_color_top'),
            bodyBackgroundBottom: setting('card_body_bg_color_bottom'),
            bodyText: setting('card_body_text_color'),
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
