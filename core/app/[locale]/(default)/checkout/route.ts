import { BigCommerceAuthError } from '@bigcommerce/catalyst-client';
import { unstable_rethrow as rethrow } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';

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
import { type ShippingState } from '~/lib/freight-cart/policy';
import { assertCartShipping, CartShippingError } from '~/lib/freight-cart/server';
import { assertLoyaltyCheckout, LoyaltyCheckoutError } from '~/lib/loyalty/server';
import { PickupCheckoutError } from '~/lib/pickup-checkout/policy';
import { preparePickupCheckout } from '~/lib/pickup-checkout/server';
import { ProUseRequiredError } from '~/lib/pro-use/policy';
import { assertProUseCart } from '~/lib/pro-use/server';
import { serverToast } from '~/lib/server-toast';
import { warehouseCheckoutOriginAllowed, warehousePreviewEnabled } from '~/lib/warehouse/config';
import { assertWarehouseCheckoutReady } from '~/lib/warehouse/local-checkout';
import { WarehouseError } from '~/lib/warehouse/policy';
import { prepareWarehousePreview } from '~/lib/warehouse/server';
import { createValidationAccess } from '~/lib/warehouse/validation';

const CheckoutEligibilityQuery = graphql(`
  query CheckoutEligibilityQuery($cartId: String) {
    site {
      checkout(entityId: $cartId) {
        subtotal {
          value
          currencyCode
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

function isCheckoutPolicyError(
  error: unknown,
): error is
  | ProUseRequiredError
  | LoyaltyCheckoutError
  | CartShippingError
  | PickupCheckoutError
  | WarehouseError {
  return (
    error instanceof WarehouseError ||
    error instanceof ProUseRequiredError ||
    error instanceof LoyaltyCheckoutError ||
    error instanceof CartShippingError ||
    error instanceof PickupCheckoutError
  );
}

async function prepareCheckout(cartId: string, shippingState: ShippingState | undefined) {
  try {
    await preparePickupCheckout(cartId, shippingState);
  } catch (error) {
    rethrow(error);
    if (error instanceof BigCommerceAuthError || error instanceof PickupCheckoutError) throw error;
    throw new PickupCheckoutError(
      'Checkout preparation is temporarily unavailable. Please retry from the cart.',
    );
  }
}

async function prepareCheckoutFulfillment(cartId: string) {
  if (warehousePreviewEnabled()) return;
  await prepareCheckout(cartId, await assertCartShipping(cartId));
}

async function getWarehouseHandoff(cartId: string, rehearsal: boolean) {
  if (!warehousePreviewEnabled()) return undefined;
  await assertWarehouseCheckoutReady(rehearsal);

  return prepareWarehousePreview(cartId);
}

function warehouseCheckoutResponse(
  warehouseHandoff: Awaited<ReturnType<typeof prepareWarehousePreview>>,
  checkoutUrl: string,
  storefrontOrigin: string,
  rehearsal: boolean,
) {
  const destination = new URL(checkoutUrl);

  if (destination.protocol !== 'https:' || !warehouseCheckoutOriginAllowed(destination.origin))
    throw new WarehouseError('The checkout address is not configured for this warehouse.');

  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

  if (!rehearsal) return NextResponse.redirect(destination, { status: 303, headers });

  return NextResponse.json(
    {
      protocol: 'warehouse-preview-v2',
      warehouseCheckout: {
        version: 1,
        preview: true,
        cartId: warehouseHandoff.record.cartId,
        warehouse: warehouseHandoff.warehouse,
        validation: createValidationAccess(
          warehouseHandoff.record,
          destination.origin,
          storefrontOrigin,
        ),
      },
      checkoutUrl,
    },
    { headers },
  );
}

async function checkoutCartId(req: NextRequest) {
  return req.nextUrl.searchParams.get('cartId') ?? (await getCartId());
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const cartId = await checkoutCartId(req);
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
    await assertProUseCart(cartId);
    await assertLoyaltyCheckout(cartId);

    await prepareCheckoutFulfillment(cartId);

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

    const rehearsal = req.nextUrl.searchParams.get('handoff') === 'json';
    const warehouseHandoff = await getWarehouseHandoff(cartId, rehearsal);

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

    const checkoutUrl = data.cart.createCartRedirectUrls.redirectUrls.redirectedCheckoutUrl;

    if (warehouseHandoff)
      return warehouseCheckoutResponse(
        warehouseHandoff,
        checkoutUrl,
        req.nextUrl.origin,
        rehearsal,
      );

    return redirect({ href: checkoutUrl, locale });
  } catch (error) {
    rethrow(error);

    if (isCheckoutPolicyError(error)) {
      await serverToast.error(error.message);

      return redirect({ href: '/cart', locale });
    }

    if (error instanceof BigCommerceAuthError) {
      return redirect({ href: '/logout?redirectTo=/checkout/', locale });
    }

    // eslint-disable-next-line no-console
    console.error(error);

    return NextResponse.json(
      { message: 'Server error' },
      { status: 500, statusText: 'Server error' },
    );
  }
}
