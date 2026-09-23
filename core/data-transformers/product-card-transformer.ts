import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { ResultOf } from 'gql.tada';
import { getFormatter } from 'next-intl/server';

import { Product } from '@/vibes/soul/primitives/product-card';
import { ExistingResultType } from '~/client/util';
import { ProductCardFragment } from '~/components/product-card/fragment';
import { WishlistItemProductFragment } from '~/components/wishlist/fragment';
import { isProUseProduct } from '~/lib/pro-use/policy';
import {
  getProductAttributes,
  ProductAttributeFilter,
  productFilterDefinitions,
} from '~/lib/product-metafield-filters';
import { getStockDisplayData, StockDisplaySettings } from '~/lib/stock-display';

import { hasZeroPrice, pricesTransformer, TaxDisplay } from './prices-transformer';
import { isShowCrateProduct, showCrateProductTransformer } from './show-crate-product-transformer';

interface ProductCardStockDisplay {
  settings?: StockDisplaySettings | null;
  formatStock: (quantity: number) => string;
}

const getInventoryMessage = (
  product: ResultOf<typeof ProductCardFragment>,
  outOfStockMessage?: string,
  showBackorderMessage?: boolean,
) => {
  if (!product.inventory.isInStock) {
    return outOfStockMessage;
  }

  if (!showBackorderMessage || product.inventory.hasVariantInventory) {
    return undefined;
  }

  const { availableForBackorder, unlimitedBackorder, availableOnHand } =
    product.inventory.aggregated ?? {};

  if (availableOnHand) {
    return undefined;
  }

  const hasBackorderAvailablity = !!availableForBackorder || unlimitedBackorder;

  if (!hasBackorderAvailablity) {
    return undefined;
  }

  const baseVariant = removeEdgesAndNodes(product.variants).at(0);

  if (!baseVariant?.inventory?.byLocation) {
    return undefined;
  }

  const inventoryByLocation = removeEdgesAndNodes(baseVariant.inventory.byLocation).at(0);

  return inventoryByLocation?.backorderMessage ?? undefined;
};

export const getProductCardAttributes = (
  product: ResultOf<typeof ProductCardFragment | typeof WishlistItemProductFragment>,
  filters?: ProductAttributeFilter[],
) => {
  const packing =
    'packingFields' in product
      ? removeEdgesAndNodes(product.packingFields).at(0)?.value.trim()
      : undefined;

  return [
    ...(packing
      ? [{ key: 'packing', label: 'Packing', values: [{ value: packing, label: packing }] }]
      : []),
    ...getProductAttributes(
      'attributeMetafields' in product ? removeEdgesAndNodes(product.attributeMetafields) : [],
      productFilterDefinitions.map(
        ({ productKey }) =>
          filters?.find(({ paramName }) => paramName === `mf_${productKey}`) ?? {
            paramName: `mf_${productKey}`,
            label: productKey.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()),
            options: [],
          },
      ),
    ),
  ];
};

const productCardAttributeVariants = (
  product: ResultOf<typeof ProductCardFragment | typeof WishlistItemProductFragment>,
  filters?: ProductAttributeFilter[],
) => {
  const listEnabled = process.env.ENABLE_PRODUCT_CARD_ATTRIBUTES === 'true';
  const gridEnabled = process.env.ENABLE_ENHANCED_PRODUCT_ATTRIBUTES === 'true';
  const attributes = listEnabled || gridEnabled ? getProductCardAttributes(product, filters) : [];

  return {
    attributes: listEnabled ? attributes : undefined,
    enhancedGridAttributes: gridEnabled ? attributes : undefined,
  };
};

export const singleProductCardTransformer = (
  product: ResultOf<typeof ProductCardFragment | typeof WishlistItemProductFragment>,
  format: ExistingResultType<typeof getFormatter>,
  outOfStockMessage?: string,
  showBackorderMessage?: boolean,
  taxDisplay?: TaxDisplay | null,
  stockDisplay?: ProductCardStockDisplay,
  attributeFilters?: ProductAttributeFilter[],
): Product => {
  return {
    ...showCrateProductTransformer(product),
    ...productCardAttributeVariants(product, attributeFilters),
    id: product.entityId.toString(),
    isProUseOnly: isProUseProduct(product),
    title: product.name,
    descriptionHtml: 'description' in product ? product.description : undefined,
    listViewDescription:
      'listViewDescriptionMetafield' in product
        ? removeEdgesAndNodes(product.listViewDescriptionMetafield).at(0)?.value.trim() || undefined
        : undefined,
    href: product.path,
    hasOptions:
      'productOptions' in product
        ? removeEdgesAndNodes(product.productOptions).length > 0
        : undefined,
    canAddToCart:
      product.showCartAction &&
      product.availabilityV2.status !== 'Unavailable' &&
      product.inventory.isInStock,
    isPreorder: product.availabilityV2.status === 'Preorder',
    minQuantity:
      'minPurchaseQuantity' in product && product.minPurchaseQuantity != null
        ? Math.max(1, product.minPurchaseQuantity)
        : undefined,
    maxQuantity:
      'maxPurchaseQuantity' in product && product.maxPurchaseQuantity != null
        ? product.maxPurchaseQuantity
        : undefined,
    image: product.defaultImage
      ? { src: product.defaultImage.url, alt: product.defaultImage.altText }
      : undefined,
    price:
      isShowCrateProduct(product) && hasZeroPrice(product)
        ? undefined
        : pricesTransformer(product, format, taxDisplay),
    subtitle: product.brand?.name ?? undefined,
    rating: product.reviewSummary.averageRating,
    numberOfReviews: product.reviewSummary.numberOfReviews,
    useEnhancedStockDisplay: process.env.ENABLE_ENHANCED_STOCK_DISPLAY === 'true',
    inventoryMessage:
      'variants' in product
        ? getInventoryMessage(product, outOfStockMessage, showBackorderMessage)
        : undefined,
    isInStock: product.inventory.isInStock,
    stockDisplayData:
      stockDisplay && 'variants' in product
        ? getStockDisplayData(
            // A list card has no selected variant. Do not display a combined or arbitrary count.
            product.inventory.hasVariantInventory
              ? { isInStock: product.inventory.isInStock }
              : product.inventory,
            stockDisplay.settings,
            stockDisplay.formatStock,
          )
        : undefined,
    promotions:
      'featuredPromotions' in product
        ? removeEdgesAndNodes(product.featuredPromotions).map((p) => ({
            id: p.entityId.toString(),
            text: p.text,
          }))
        : undefined,
  };
};

export const productCardTransformer = (
  products: Array<ResultOf<typeof ProductCardFragment | typeof WishlistItemProductFragment>>,
  format: ExistingResultType<typeof getFormatter>,
  outOfStockMessage?: string,
  showBackorderMessage?: boolean,
  taxDisplay?: TaxDisplay | null,
  stockDisplay?: ProductCardStockDisplay,
  attributeFilters?: ProductAttributeFilter[],
): Product[] => {
  return products
    .filter((product) => isShowCrateProduct(product) || !hasZeroPrice(product))
    .map((product) =>
      singleProductCardTransformer(
        product,
        format,
        outOfStockMessage,
        showBackorderMessage,
        taxDisplay,
        stockDisplay,
        attributeFilters,
      ),
    );
};
