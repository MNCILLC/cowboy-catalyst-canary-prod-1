import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { ResultOf } from 'gql.tada';
import { getFormatter } from 'next-intl/server';

import { ShowComparisonData } from '@/vibes/soul/sections/product-detail/show-comparison';
import { ShowComparisonProductFragment } from '~/app/[locale]/(default)/product/[slug]/show-comparison-data';
import { ExistingResultType } from '~/client/util';

import { hasZeroPrice, pricesTransformer, TaxDisplay } from './prices-transformer';
import { getShowCrateCustomFieldNames, isShowCrateProduct } from './show-crate-product-transformer';

export function showComparisonTransformer(
  products: Array<ResultOf<typeof ShowComparisonProductFragment>>,
  format: ExistingResultType<typeof getFormatter>,
  taxDisplay?: TaxDisplay | null,
): ShowComparisonData {
  const columns = products.map((product) => {
    const customFields = removeEdgesAndNodes(product.showCustomFields);
    const fields = getShowCrateCustomFieldNames(product).flatMap((name) => {
      const values = customFields
        .filter((field) => field.name.trim() === name && field.value.trim() !== '')
        .map((field) => field.value.trim());

      return values.length > 0 ? [{ name, value: values.join('\n') }] : [];
    });

    return {
      id: product.entityId.toString(),
      title: removeEdgesAndNodes(product.comparisonShowName).at(0)?.value.trim() || product.name,
      href: product.path,
      fields,
      price:
        product.isPriceHidden || (isShowCrateProduct(product) && hasZeroPrice(product))
          ? undefined
          : pricesTransformer(product, format, taxDisplay),
    };
  });

  return {
    products: columns,
    features: [...new Set(columns.flatMap((product) => product.fields.map((field) => field.name)))],
  };
}
