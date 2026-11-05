import { z } from 'zod';

import { shippingPreferencesSchema, type ShippingSelection } from './policy';

export interface FreightConnection {
  url: string;
  storeHash: string;
  token: string;
}

// Only called on the server. Never pass the connection or token into client props.
export async function requestCartPreferences(
  connection: FreightConnection,
  cartId: string,
  update?: ShippingSelection & { expectedVersion: number },
) {
  const id = z.string().uuid().parse(cartId);
  const base = new URL(connection.url);

  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))
  ) {
    throw new Error('Invalid Freight App URL.');
  }

  if (!/^[a-z0-9]{2,32}$/.test(connection.storeHash) || connection.token.length < 32) {
    throw new Error('Freight App connection is not configured.');
  }

  const response = await fetch(new URL(`/api/shipping/cart-preferences/${id}`, base), {
    method: update ? 'PUT' : 'GET',
    headers: {
      Authorization: `Bearer ${connection.token}`,
      'X-Freight-Store-Hash': connection.storeHash,
      'Content-Type': 'application/json',
    },
    body: update ? JSON.stringify(update) : undefined,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) throw new Error('Unable to save or load shipping preferences.');

  return z
    .object({ preferences: shippingPreferencesSchema.nullable() })
    .parse(await response.json()).preferences;
}
