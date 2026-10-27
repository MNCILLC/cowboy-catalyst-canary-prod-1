import 'server-only';

import { jwtVerify, SignJWT } from 'jose';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const PREVIEW_COOKIE = 'storefront-preview-access';
export const PREVIEW_PATH = '/storefront-preview';
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 7;

export function getPreviewConfig() {
  // Disabled by default; only an explicit lowercase 'true' enables the gate.
  const enabled = (process.env.STOREFRONT_PREVIEW_ENABLED ?? 'false') === 'true';
  const code = process.env.STOREFRONT_PREVIEW_CODE ?? '';
  const secret = process.env.STOREFRONT_PREVIEW_SECRET ?? '';

  return { enabled, code, secret, configured: code.length > 0 && secret.length >= 32 };
}

export function matchesPreviewCode(candidate: string, code: string) {
  return timingSafeEqual(
    createHash('sha256').update(candidate).digest(),
    createHash('sha256').update(code).digest(),
  );
}

function signingKey(code: string, secret: string) {
  // Bind sessions to both settings so changing either revokes every existing session.
  return createHmac('sha256', secret).update(code).digest();
}

export async function createPreviewSession(code: string, secret: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('catalyst-storefront-preview')
    .setAudience('storefront')
    .setIssuedAt()
    .setExpirationTime(`${PREVIEW_MAX_AGE}s`)
    .sign(signingKey(code, secret));
}

export async function hasPreviewSession(token: string | undefined, code: string, secret: string) {
  if (!token) return false;

  try {
    await jwtVerify(token, signingKey(code, secret), {
      algorithms: ['HS256'],
      issuer: 'catalyst-storefront-preview',
      audience: 'storefront',
      maxTokenAge: PREVIEW_MAX_AGE,
      requiredClaims: ['exp', 'iat'],
    });

    return true;
  } catch {
    return false;
  }
}

export function safePreviewReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';

  try {
    // Reject encoded separators/control characters as well as literal ones.
    const decoded = decodeURIComponent(value);

    // Control characters must be rejected before URL normalization.
    // eslint-disable-next-line no-control-regex
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return '/';

    const url = new URL(value, 'https://storefront.invalid');

    if (
      url.origin !== 'https://storefront.invalid' ||
      url.pathname.startsWith(PREVIEW_PATH) ||
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/_next/')
    )
      return '/';

    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}
