import { BigCommerceAuthError } from '@bigcommerce/catalyst-client';
import { unstable_rethrow as rethrow } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getSessionCustomerAccessToken } from '~/auth';
import { getChannelIdFromLocale } from '~/channels.config';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { redirect } from '~/i18n/routing';
import { getVisitIdCookie, getVisitorIdCookie } from '~/lib/analytics/bigcommerce';
import { getCartId } from '~/lib/cart';
import { getMinimumOrderSubtotal } from '~/lib/cart/minimum-order';
import { createCheckoutHandoff, isLocationCheckoutEnabled } from '~/lib/checkout/checkout-handoff';
import { CheckoutHandoffError } from '~/lib/checkout/handoff-client';
import { isCheckoutAuthenticationRequired } from '~/lib/checkout-authentication';
import { getConsentCookie } from '~/lib/consent-manager/cookies/server';
import { getPreferredLocationId } from '~/lib/location';
import { getAllLocations } from '~/lib/location/get-locations';
import {
  getLocationPickupMethodId,
  PickupCheckoutError,
  prepareShippingCheckout,
} from '~/lib/pickup/prepare-pickup-checkout';
import { ProUseRequiredError } from '~/lib/pro-use/policy';
import { assertProUseCart } from '~/lib/pro-use/server';
import { serverToast } from '~/lib/server-toast';

const CheckoutEligibilityQuery = graphql(`
  query CheckoutEligibilityQuery($cartId: String) {
    site {
      checkout(entityId: $cartId) {
        entityId
        customerMessage
        subtotal {
          value
          currencyCode
        }
      }
    }
  }
`);

const SetCheckoutLocationMutation = graphql(`
  mutation SetCheckoutLocationMutation($input: UpdateCheckoutCustomerMessageInput!) {
    checkout {
      updateCheckoutCustomerMessage(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);

const CheckoutRedirectMutation = graphql(`
  mutation CheckoutRedirectMutation(
    $cartId: String!
    $visitId: String!
    $visitorId: String!
    $referer: URL!
    $userAgent: String!
    $analyticsConsent: Boolean!
    $functionalConsent: Boolean!
    $targetingConsent: Boolean!
    $locationQueryParams: [CreateCartRedirectUrlsQueryParamsInput!]
  ) {
    cart {
      createCartRedirectUrls(
        input: {
          cartEntityId: $cartId
          queryParams: $locationQueryParams
          analytics: {
            initiator: { visitId: $visitId, visitorId: $visitorId }
            request: { url: $referer, userAgent: $userAgent }
            consent: {
              analytics: $analyticsConsent
              functional: $functionalConsent
              targeting: $targetingConsent
            }
          }
        }
      ) {
        errors {
          ... on NotFoundError {
            __typename
          }
        }
        redirectUrls {
          redirectedCheckoutUrl
        }
      }
    }
  }
`);

async function prepareCheckoutForShoppingLocation({
  channelId,
  checkout,
  customerAccessToken,
}: {
  channelId: string | undefined;
  checkout: { entityId: string; customerMessage?: string | null };
  customerAccessToken?: string;
}) {
  const locationId = await getPreferredLocationId();
  const location = (await getAllLocations()).find(({ id }) => id === locationId);

  if (!location) {
    throw new PickupCheckoutError(`Shopping location ${locationId} is not available.`);
  }

  if (isLocationCheckoutEnabled()) {
    await prepareShippingCheckout(checkout.entityId);

    // The backend validates the live cart, inventory, product and channel. This saved
    // allocation is authoritative; shoppers may freely edit their order comments.
    return createCheckoutHandoff({
      cartId: checkout.entityId,
      channelId: Number(channelId ?? process.env.BIGCOMMERCE_CHANNEL_ID),
      locationId: location.id,
    });
  }

  const pickupMethodId = await getLocationPickupMethodId(location.id);
  const marker = `[Shopping location: ${location.label} (#${location.id})][Pickup method: #${pickupMethodId}]`;
  const customerMessage = checkout.customerMessage?.replace(
    /^\[Shopping location:.*?\](?:\[Pickup method: #\d+\])?\s*/,
    '',
  );

  await client.fetch({
    document: SetCheckoutLocationMutation,
    variables: {
      input: {
        checkoutEntityId: checkout.entityId,
        data: { message: `${marker}${customerMessage ? ` ${customerMessage}` : ''}` },
      },
    },
    fetchOptions: { cache: 'no-store' },
    customerAccessToken,
    channelId,
  });

  await prepareShippingCheckout(checkout.entityId);
}

function isAllowedCheckoutCart(cartId: string | undefined, sessionCartId: string | undefined) {
  return Boolean(cartId) && (!isLocationCheckoutEnabled() || cartId === sessionCartId);
}

function isPickupPreparationError(error: unknown): boolean {
  return (
    error instanceof PickupCheckoutError ||
    error instanceof CheckoutHandoffError ||
    error instanceof z.ZodError
  );
}

async function handleCheckoutError(error: unknown, locale: string, errorMessage: string) {
  rethrow(error);

  if (error instanceof BigCommerceAuthError) {
    return redirect({ href: '/logout?redirectTo=/checkout/', locale });
  }

  if (error instanceof ProUseRequiredError) {
    await serverToast.error(error.message);

    return redirect({ href: '/cart', locale });
  }

  if (isPickupPreparationError(error)) {
    // eslint-disable-next-line no-console
    console.error('Unable to prepare BigCommerce pickup checkout', error);
    await serverToast.error(errorMessage);

    return redirect({ href: '/cart', locale });
  }

  // eslint-disable-next-line no-console
  console.error(error);

  return NextResponse.json(
    { message: 'Server error' },
    { status: 500, statusText: 'Server error' },
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const sessionCartId = await getCartId();
  const cartId = req.nextUrl.searchParams.get('cartId') ?? sessionCartId;
  const customerAccessToken = await getSessionCustomerAccessToken();
  const channelId = getChannelIdFromLocale(locale);
  const t = await getTranslations('Cart.Errors');

  if (isCheckoutAuthenticationRequired && !customerAccessToken) {
    await serverToast.error(t('authenticationRequired'));

    return redirect({ href: '/login?redirectTo=/checkout/', locale });
  }

  if (!isAllowedCheckoutCart(cartId, sessionCartId) || !cartId) {
    await serverToast.error(t('cartNotFound'));

    return redirect({ href: '/cart', locale });
  }

  const visitId = await getVisitIdCookie();
  const visitorId = await getVisitorIdCookie();
  const consent = await getConsentCookie();

  try {
    await assertProUseCart(cartId);

    const minimumOrderSubtotal = getMinimumOrderSubtotal();
    const { data: eligibilityData } = await client.fetch({
      document: CheckoutEligibilityQuery,
      variables: { cartId },
      fetchOptions: { cache: 'no-store' },
      customerAccessToken,
      channelId,
    });
    const subtotal = eligibilityData.site.checkout?.subtotal;

    if (!subtotal || subtotal.value < minimumOrderSubtotal) {
      await serverToast.error(
        t('minimumOrderNotMet', {
          minimum: new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: subtotal?.currencyCode ?? 'USD',
          }).format(minimumOrderSubtotal),
        }),
      );

      return redirect({ href: '/cart', locale });
    }

    const checkout = eligibilityData.site.checkout;

    const locationQueryParams = checkout
      ? await prepareCheckoutForShoppingLocation({ channelId, checkout, customerAccessToken })
      : undefined;

    const { data } = await client.fetch({
      document: CheckoutRedirectMutation,
      variables: {
        cartId,
        locationQueryParams,
        visitId: visitId ?? '',
        visitorId: visitorId ?? '',
        analyticsConsent: consent?.['c.measurement'] ?? false,
        functionalConsent: consent?.['c.functionality'] ?? false,
        targetingConsent: consent?.['c.marketing'] ?? false,
        referer: req.headers.get('referer') ?? '',
        userAgent: req.headers.get('user-agent') ?? '',
      },
      fetchOptions: { cache: 'no-store' },
      customerAccessToken,
      channelId,
    });

    if (
      data.cart.createCartRedirectUrls.errors.length > 0 ||
      !data.cart.createCartRedirectUrls.redirectUrls
    ) {
      await serverToast.error(t('somethingWentWrong'));

      return redirect({ href: '/cart', locale });
    }

    return redirect({
      href: data.cart.createCartRedirectUrls.redirectUrls.redirectedCheckoutUrl,
      locale,
    });
  } catch (error) {
    return handleCheckoutError(error, locale, t('somethingWentWrong'));
  }
}
