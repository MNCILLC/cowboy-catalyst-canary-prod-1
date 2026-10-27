import { NextRequest, NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql, ResultOf } from '~/client/graphql';
import { hasZeroPrice } from '~/data-transformers/prices-transformer';
import { isShowCrateProduct } from '~/data-transformers/show-crate-product-transformer';
import { routing } from '~/i18n/routing';
import { getPreferredCurrencyCode } from '~/lib/currency';
import { withLocationInventory } from '~/lib/location/with-location-inventory';
import { MakeswiftProductFragment } from '~/lib/makeswift/utils/use-bc-product-to-vibes-product/fragment';
import { requiresPricingLogin } from '~/lib/wholesale-pricing';
import { hideWholesalePrices } from '~/lib/wholesale-pricing-policy';

const GetProduct = graphql(
  `
    query GetProduct($entityId: Int!, $currencyCode: currencyCode) {
      site {
        product(entityId: $entityId) {
          ...MakeswiftProductFragment
        }
      }
    }
  `,
  [MakeswiftProductFragment],
);

export type GetProductResponse = ResultOf<typeof GetProduct>['site']['product'];

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> },
) => {
  const customerAccessToken = await getSessionCustomerAccessToken();
  const currencyCode = await getPreferredCurrencyCode();
  const searchParams = request.nextUrl.searchParams;
  const locale = searchParams.get('locale') ?? routing.defaultLocale;

  if (!hasLocale(routing.locales, locale)) {
    return NextResponse.json(
      { status: 'error', error: 'Invalid locale parameter' },
      { status: 400 },
    );
  }

  const { entityId } = await params;

  const { data } = await client.fetch({
    document: GetProduct,
    customerAccessToken,
    variables: { entityId: parseInt(entityId, 10), currencyCode },
    fetchOptions: {
      headers: {
        'Accept-Language': locale,
      },
    },
  });

  const [product] = await withLocationInventory(data.site.product ? [data.site.product] : []);
  // const product = data.site.product;

  const hidePrices = await requiresPricingLogin();

  // return NextResponse.json(product ?? null);
  return NextResponse.json(
    product && (isShowCrateProduct(product) || !hasZeroPrice(product))
      ? hideWholesalePrices(product, hidePrices)
      : null,
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
};
