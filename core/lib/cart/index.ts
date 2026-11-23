'use server';

import { revalidateTag } from 'next/cache';
import { getLocale } from 'next-intl/server';

import { auth, getAnonymousSession, updateAnonymousSession, updateSession } from '~/auth';
import { TAGS } from '~/client/tags';
import { redirect } from '~/i18n/routing';
import { addCartLineItem, AddCartLineItemsInput } from '~/lib/cart/add-cart-line-item';
import { createCart, CreateCartInput } from '~/lib/cart/create-cart';
import { validateCartId } from '~/lib/cart/validate-cart';
import { warehousePreviewEnabled } from '~/lib/warehouse/config';

import { MissingCartError } from './error';

export async function getCartId(): Promise<string | undefined> {
  const anonymousSession = await getAnonymousSession();

  if (anonymousSession) {
    return anonymousSession.user?.cartId ?? undefined;
  }

  const session = await auth();

  return session?.user?.cartId ?? undefined;
}

export async function setCartId(cartId: string): Promise<void> {
  const anonymousSession = await getAnonymousSession();

  if (anonymousSession) {
    await updateAnonymousSession({ cartId });

    return;
  }

  await updateSession({ user: { cartId } });
}

export async function clearCartId(): Promise<void> {
  const anonymousSession = await getAnonymousSession();

  if (anonymousSession) {
    await updateAnonymousSession({ cartId: null });

    return;
  }

  await updateSession({ user: { cartId: null } });
}

export async function addToOrCreateCart(
  formData: FormData,
  data: CreateCartInput | AddCartLineItemsInput['data'],
): Promise<void> {
  const field = formData.get('displayedWarehouseCart');
  const displayedCart = typeof field === 'string' ? field : null;
  const cartId = await getCartId();
  // An empty warehouse has no native cart until its first item. A query without an ID
  // can resolve BigCommerce's persistent cart for a different warehouse.
  const cart = !cartId && warehousePreviewEnabled() ? null : await validateCartId(cartId);

  if (cart) {
    const response = await addCartLineItem(cart.entityId, data, displayedCart);

    if (!response.data.cart.addCartLineItems?.cart?.entityId) {
      throw new MissingCartError();
    }

    revalidateTag(TAGS.cart, { expire: 0 });

    return;
  }

  const { cartId: newCartId, recovered } = await createCart(data, displayedCart);

  if (!newCartId) throw new MissingCartError();

  await setCartId(newCartId);
  revalidateTag(TAGS.cart, { expire: 0 });

  if (recovered) redirect({ href: '/cart', locale: await getLocale() });
}
