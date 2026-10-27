import { NextResponse } from 'next/server';

import { composeProxies } from './proxies/compose-proxies';
import { withAnalyticsCookies } from './proxies/with-analytics-cookies';
import { withAuth } from './proxies/with-auth';
import { withChannelId } from './proxies/with-channel-id';
import { withGraphqlProxy } from './proxies/with-graphql-proxy';
import { withIntl } from './proxies/with-intl';
import { withMakeswift } from './proxies/with-makeswift';
import { withRoutes } from './proxies/with-routes';
import { withStorefrontPreview } from './proxies/with-storefront-preview';

const storefrontProxy = composeProxies(
  withAuth,
  withMakeswift,
  withIntl,
  withAnalyticsCookies,
  withChannelId,
  withGraphqlProxy,
  withRoutes,
);

// Routes previously excluded from the Catalyst stack must still pass the access gate.
export const proxy = withStorefrontPreview((request, event) => {
  // Serve PDF renderer assets and locally hosted catalogs without storefront route resolution.
  // These requests still pass through the preview access gate above.
  if (
    request.nextUrl.pathname.startsWith('/pdfjs/') ||
    /^\/catalogs\/.+\.pdf$/i.test(request.nextUrl.pathname)
  ) {
    return NextResponse.next();
  }

  if (
    /^\/(?:api(?:\/|$)|admin(?:\/|$)|sitemap\.xml$|xmlsitemap\.php$|robots\.txt$)/.test(
      request.nextUrl.pathname,
    )
  ) {
    return NextResponse.next();
  }

  return storefrontProxy(request, event);
});

export const config = {
  matcher: [
    // Only public assets and platform internals bypass the storefront access gate.
    '/((?!images/|_next/static|_next/image|_vercel|favicon.ico).*)',
  ],
};
