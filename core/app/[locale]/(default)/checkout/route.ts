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
import { isCheckoutAuthenticationRequired } from '~/lib/checkout-authentication';
import { getConsentCookie } from '~/lib/consent-manager/cookies/server';
import { getPreferredLocationId } from '~/lib/location';
import { getAllLocations } from '~/lib/location/get-locations';
import {
  getLocationPickupMethodId,
  PickupCheckoutError,
  prepareShippingCheckout,
} from '~/lib/pickup/prepare-pickup-checkout';
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
  ) {
    cart {
      createCartRedirectUrls(
        input: {
          cartEntityId: $cartId
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

function isPickupPreparationError(error: unknown): boolean {
  return error instanceof PickupCheckoutError || error instanceof z.ZodError;
}

async function handleCheckoutError(error: unknown, locale: string, errorMessage: string) {
  rethrow(error);

  if (error instanceof BigCommerceAuthError) {
    return redirect({ href: '/logout?redirectTo=/checkout/', locale });
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
  const cartId = req.nextUrl.searchParams.get('cartId') ?? (await getCartId());
  const customerAccessToken = await getSessionCustomerAccessToken();
  const channelId = getChannelIdFromLocale(locale);
  const t = await getTranslations('Cart.Errors');

  if (isCheckoutAuthenticationRequired && !customerAccessToken) {
    await serverToast.error(t('authenticationRequired'));

    return redirect({ href: '/login?redirectTo=/checkout/', locale });
  }

  if (!cartId) {
    await serverToast.error(t('cartNotFound'));

    return redirect({ href: '/cart', locale });
  }

  const visitId = await getVisitIdCookie();
  const visitorId = await getVisitorIdCookie();
  const consent = await getConsentCookie();

  try {
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

    if (checkout) {
      await prepareCheckoutForShoppingLocation({ channelId, checkout, customerAccessToken });
    }

    const { data } = await client.fetch({
      document: CheckoutRedirectMutation,
      variables: {
        cartId,
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
