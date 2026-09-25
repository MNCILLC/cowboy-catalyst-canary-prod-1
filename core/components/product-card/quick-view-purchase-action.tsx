'use client';

import { useTranslations } from 'next-intl';

import { ButtonLink } from '@/vibes/soul/primitives/button-link';
import { AddToCartForm } from '@/vibes/soul/primitives/compare-card/add-to-cart-form';
import type { Product } from '@/vibes/soul/primitives/product-card';
import { ProUseGate } from '@/vibes/soul/primitives/pro-use';
import { addToCart } from '~/app/[locale]/(default)/compare/_actions/add-to-cart';

export function QuickViewPurchaseAction({ product }: { product: Product }) {
  const t = useTranslations('Compare');
  const tSubmit = useTranslations('Product.ProductDetails.Submit');
  const tQuantity = useTranslations('Product.ProductDetails');

  return (
    <ProUseGate restricted={product.isProUseOnly}>
      {product.hasOptions === false ? (
        <AddToCartForm
          addToCartAction={addToCart}
          addToCartLabel={t('addToCart')}
          decrementLabel={tQuantity('decreaseQuantity')}
          disabled={product.canAddToCart !== true}
          incrementLabel={tQuantity('increaseQuantity')}
          isPreorder={product.isPreorder}
          maxQuantity={product.maxQuantity}
          minQuantity={product.minQuantity}
          preorderLabel={tSubmit('preorder')}
          productId={product.id}
          quantityLabel={tQuantity('quantity')}
          showQuantity
          size="x-small"
        />
      ) : (
        <ButtonLink href={product.href} size="x-small">
          {t('viewOptions')}
        </ButtonLink>
      )}
    </ProUseGate>
  );
}
