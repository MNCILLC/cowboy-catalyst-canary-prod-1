import 'server-only';

import { cookies } from 'next/headers';

import type { ProductView } from '@/vibes/soul/sections/product-list/view';
import { PRODUCT_VIEW_COOKIE } from '~/lib/client-cookies';

export async function getPreferredProductView(): Promise<ProductView> {
  const cookieStore = await cookies();

  return cookieStore.get(PRODUCT_VIEW_COOKIE)?.value === 'list' ? 'list' : 'grid';
}
