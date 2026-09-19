import { useFormatter } from 'next-intl';
import { useCallback } from 'react';
import { string, z } from 'zod';

import { Product } from '@/vibes/soul/primitives/product-card';
import { hasZeroPrice, pricesTransformer } from '~/data-transformers/prices-transformer';
import {
  isShowCrateProduct,
  showCrateProductTransformer,
} from '~/data-transformers/show-crate-product-transformer';

const priceSchema = z.object({
  value: z.number(),
  currencyCode: z.string(),
});

const PricesSchema = z.object({
  price: priceSchema,
  basePrice: priceSchema.nullable(),
  retailPrice: priceSchema.nullable(),
  salePrice: priceSchema.nullable(),
  priceRange: z.object({
    min: priceSchema,
    max: priceSchema,
  }),
});

export const BcProductSchema = z.object({
  showDescription: z.string(),
  showMetafields: z.object({
    edges: z.array(z.object({ node: z.object({ key: z.string(), value: z.string() }) })).nullable(),
  }),
  showCustomFields: z.object({
    edges: z
      .array(
        z.object({ node: z.object({ entityId: z.number(), name: z.string(), value: z.string() }) }),
      )
      .nullable(),
  }),
  stockDisplayData: z
    .object({
      stockLevelMessage: z.string(),
      stockLevelStatus: z.enum(['error', 'success']).optional(),
      backorderAvailabilityPrompt: z.string().nullable(),
    })
    .nullish(),
  useEnhancedStockDisplay: z.boolean().optional(),
  entityId: z.number(),
  name: z.string(),
  defaultImage: z.object({ altText: z.string(), url: string() }).nullable(),
  brand: z.object({ name: z.string(), path: z.string() }).nullable(),
  path: z.string(),
  pricesIncludingTax: PricesSchema.nullable(),
  pricesExcludingTax: PricesSchema.nullable(),
});

export type BcProductSchema = z.infer<typeof BcProductSchema>;

export type { Product };

export function useBcProductToVibesProduct(
  showStockLevel = false,
): (product: BcProductSchema) => Product {
  const format = useFormatter();

  return useCallback(
    (product) => {
      const { entityId, name, defaultImage, brand, path } = product;
      const price =
        isShowCrateProduct(product) && hasZeroPrice(product)
          ? undefined
          : pricesTransformer(product, format);

      return {
        ...showCrateProductTransformer(product),
        id: entityId.toString(),
        title: name,
        href: path,
        image: defaultImage ? { src: defaultImage.url, alt: defaultImage.altText } : undefined,
        price,
        subtitle: brand?.name,
        stockDisplayData: showStockLevel ? product.stockDisplayData : undefined,
        useEnhancedStockDisplay: showStockLevel && product.useEnhancedStockDisplay,
      };
    },
    [format, showStockLevel],
  );
}
