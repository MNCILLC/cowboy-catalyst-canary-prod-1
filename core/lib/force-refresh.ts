import { cookies } from 'next/headers';

import { FORCE_REFRESH_COOKIE } from './client-cookies';

export async function setForceRefreshCookie() {
  const cookieStore = await cookies();

  // Every logout must invalidate the client layout, including repeated sign-in/out cycles.
  cookieStore.set(FORCE_REFRESH_COOKIE, 'true', {
    httpOnly: false,
    secure: false,
    path: '/',
  });
}
