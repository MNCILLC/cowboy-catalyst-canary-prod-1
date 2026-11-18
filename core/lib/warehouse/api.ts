import 'server-only';

import { WarehouseValidationError } from './authorization';

export function warehouseApi<T>(
  path: string,
  method?: 'GET' | 'POST' | 'PUT',
  body?: unknown,
): Promise<T>;
export function warehouseApi(path: string, method: 'DELETE'): Promise<void>;

export async function warehouseApi<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T | void> {
  const hash = process.env.BIGCOMMERCE_STORE_HASH;
  const token = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!hash || !token)
    throw new WarehouseValidationError(
      'Warehouse verification is not configured.',
      503,
      'UNAVAILABLE',
    );

  const response = await fetch(`https://api.bigcommerce.com/stores/${hash}/v3/${path}`, {
    method,
    headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok)
    throw new WarehouseValidationError(
      response.status === 404
        ? 'This cart is no longer available. Return to the storefront.'
        : 'Warehouse verification is unavailable. Please retry.',
      response.status === 404 ? 404 : 503,
      response.status === 404 ? 'CART_NOT_FOUND' : 'UNAVAILABLE',
    );

  if (method === 'DELETE' && response.status === 204) return;

  // Management API responses are further checked at the policy boundary.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const result: { data: T; errors?: Record<string, unknown> | unknown[] } = await response.json();

  if (result.errors && Object.keys(result.errors).length)
    throw new WarehouseValidationError(
      'Unable to save the cart warehouse. Please retry.',
      503,
      'UNAVAILABLE',
    );

  return result.data;
}
