import { NextResponse } from 'next/server';

import {
  getPreviewConfig,
  hasPreviewSession,
  PREVIEW_COOKIE,
  PREVIEW_PATH,
  safePreviewReturnPath,
} from '~/lib/preview-access';

import { type ProxyFactory } from './compose-proxies';

function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return response;
}

function isLocalInitialization(pathname: string) {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.WAREHOUSE_MODE === 'development' &&
    process.env.WAREHOUSE_ONE_CLICK_ENABLED === 'true' &&
    /^\/api\/warehouse\/initialize\/?$/.test(pathname)
  );
}

export const withStorefrontPreview: ProxyFactory = (next) => {
  return async (request, event) => {
    const config = getPreviewConfig();
    const { pathname } = request.nextUrl;
    const isGate = pathname === PREVIEW_PATH || pathname === `${PREVIEW_PATH}/`;

    // Makeswift's own handler validates its API key. Draft-mode headers/cookies on
    // storefront routes do not bypass this gate; editors unlock the storefront too.
    if (pathname === '/api/storefront-preview' || /^\/api\/makeswift(?:\/|$)/.test(pathname)) {
      return NextResponse.next();
    }

    // Checkout deliberately omits storefront cookies. Only these capability-authenticated
    // handlers may receive its preflight/POST requests; they enforce the allowed origin,
    // signed cart credential, expiry, warehouse revision and inventory themselves.
    // Popup authorization uses its first-party storefront session. The local exchange verifies Current Customer.
    if (
      ['OPTIONS', 'POST'].includes(request.method) &&
      (/^\/api\/warehouse\/(?:validate|freight)\/?$/.test(pathname) ||
        isLocalInitialization(pathname))
    ) {
      return privateResponse(NextResponse.next());
    }

    if (config.enabled && pathname === '/robots.txt') {
      return privateResponse(
        new NextResponse('User-agent: *\nDisallow: /\n', {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      );
    }

    if (!config.enabled) {
      if (isGate) {
        return privateResponse(
          NextResponse.redirect(
            new URL(
              safePreviewReturnPath(request.nextUrl.searchParams.get('returnTo')),
              request.url,
            ),
            303,
          ),
        );
      }

      return next(request, event);
    }

    const authorized =
      config.configured &&
      (await hasPreviewSession(
        request.cookies.get(PREVIEW_COOKIE)?.value,
        config.code,
        config.secret,
      ));

    if (isGate) {
      return privateResponse(
        authorized
          ? NextResponse.redirect(
              new URL(
                safePreviewReturnPath(request.nextUrl.searchParams.get('returnTo')),
                request.url,
              ),
              303,
            )
          : NextResponse.next(),
      );
    }

    if (authorized) {
      const response = await next(request, event);

      if (response) {
        response.headers.set('Cache-Control', 'private, no-store');
        response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      }

      return response;
    }

    if (
      pathname.startsWith('/api/') ||
      pathname === '/graphql' ||
      !['GET', 'HEAD'].includes(request.method)
    ) {
      return privateResponse(
        NextResponse.json({ error: 'Storefront access code required.' }, { status: 401 }),
      );
    }

    const destination = new URL(PREVIEW_PATH, request.url);

    destination.searchParams.set(
      'returnTo',
      safePreviewReturnPath(`${pathname}${request.nextUrl.search}`),
    );

    return privateResponse(NextResponse.redirect(destination, 303));
  };
};
