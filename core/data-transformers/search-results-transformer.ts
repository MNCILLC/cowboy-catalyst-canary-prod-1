import { ResultOf } from 'gql.tada';
import { getFormatter, getTranslations } from 'next-intl/server';

import { SearchResult } from '@/vibes/soul/primitives/navigation';
import { SearchProductFragment } from '~/components/header/_actions/fragment';

import { hasZeroPrice, TaxDisplay } from './prices-transformer';
import { singleProductCardTransformer } from './product-card-transformer';
import { isShowCrateProduct } from './show-crate-product-transformer';

export async function searchResultsTransformer(
  searchProducts: Array<ResultOf<typeof SearchProductFragment>>,
  taxDisplay?: TaxDisplay | null,
): Promise<SearchResult[]> {
  const format = await getFormatter();
  const t = await getTranslations('Components.Header.Search');
  const visibleProducts = searchProducts.filter(
    (product) => isShowCrateProduct(product) || !hasZeroPrice(product),
  );

  const productResults: SearchResult = {
    type: 'products',
    title: t('products'),
    products: visibleProducts.map((product) =>
      singleProductCardTransformer(product, format, undefined, undefined, taxDisplay),
    ),
  };

  const categoryResults: SearchResult = {
    type: 'links',
    title: t('categories'),
    links:
      visibleProducts.length > 0
        ? Object.entries(
            visibleProducts.reduce<Record<string, string>>((categories, product) => {
              product.categories.edges?.forEach((category) => {
                categories[category.node.name] = category.node.path;
              });

              return categories;
            }, {}),
          ).map(([name, path]) => {
            return { label: name, href: path };
          })
        : [],
  };

  const brandResults: SearchResult = {
    type: 'links',
    title: t('brands'),
    links:
      visibleProducts.length > 0
        ? Object.entries(
            visibleProducts.reduce<Record<string, string>>((brands, product) => {
              if (product.brand) {
                brands[product.brand.name] = product.brand.path;
              }

              return brands;
            }, {}),
          ).map(([name, path]) => {
            return { label: name, href: path };
          })
        : [],
  };

  const results = [];

  if (categoryResults.links.length > 0) {
    results.push(categoryResults);
  }

  if (brandResults.links.length > 0) {
    results.push(brandResults);
  }

  if (productResults.products.length > 0) {
    results.push(productResults);
  }

  return results;
}
