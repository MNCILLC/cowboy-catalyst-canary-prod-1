import { LRUCache } from 'lru-cache';
import { NextRequest, NextResponse } from 'next/server';

import {
  createPreviewSession,
  getPreviewConfig,
  matchesPreviewCode,
  PREVIEW_COOKIE,
  PREVIEW_MAX_AGE,
  PREVIEW_PATH,
  safePreviewReturnPath,
} from '~/lib/preview-access';

// Best-effort per-instance throttling. Multi-instance hosts should also rate-limit
// this endpoint at their trusted ingress (where the client IP is authoritative).
const attempts = new LRUCache<string, number>({ max: 10000, ttl: 15 * 60 * 1000 });

function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return response;
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return privateResponse(NextResponse.json({ error: 'Invalid origin.' }, { status: 403 }));
  }

  const config = getPreviewConfig();

  if (!config.enabled)
    return privateResponse(NextResponse.redirect(new URL('/', request.url), 303));

  if (!config.configured) {
    return privateResponse(
      NextResponse.json(
        { error: 'Storefront access is temporarily unavailable.' },
        { status: 503 },
      ),
    );
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const count = attempts.get(clientIp) ?? 0;

  if (count >= 10) {
    const limitedResponse = NextResponse.json(
      { error: 'Too many attempts. Please try again in 15 minutes.' },
      { status: 429 },
    );

    limitedResponse.headers.set('Retry-After', '900');

    return privateResponse(limitedResponse);
  }

  attempts.set(clientIp, count + 1);

  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return privateResponse(NextResponse.json({ error: 'Invalid form.' }, { status: 400 }));
  }

  // Read with a hard bound even when Content-Length is absent or misleading.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  if (reader) {
    let chunk = await reader.read();

    while (!chunk.done) {
      size += chunk.value.length;

      if (size > 8192) {
        // Stop reading immediately once the size bound is exceeded.
        // eslint-disable-next-line no-await-in-loop
        await reader.cancel();

        return privateResponse(NextResponse.json({ error: 'Form too large.' }, { status: 413 }));
      }

      chunks.push(chunk.value);
      // Stream reads must be sequential to enforce the size limit.
      // eslint-disable-next-line no-await-in-loop
      chunk = await reader.read();
    }
  }

  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  const code = form.get('code') ?? '';
  const returnTo = safePreviewReturnPath(form.get('returnTo'));

  if (!matchesPreviewCode(code, config.code)) {
    const destination = new URL(PREVIEW_PATH, request.url);

    destination.searchParams.set('error', 'invalid');
    destination.searchParams.set('returnTo', returnTo);

    return privateResponse(NextResponse.redirect(destination, 303));
  }

  attempts.delete(clientIp);

  const response = privateResponse(NextResponse.redirect(new URL(returnTo, request.url), 303));

  response.cookies.set(PREVIEW_COOKIE, await createPreviewSession(config.code, config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: PREVIEW_MAX_AGE,
  });

  return response;
}
