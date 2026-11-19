/* eslint-disable max-classes-per-file -- Related transport error types form one public contract. */
import { z } from 'zod';

import { shippingPreferencesSchema, type ShippingSelection } from './policy';

export interface FreightConnection {
  url: string;
  storeHash: string;
  token: string;
}

export class FreightPreferenceConflict extends Error {}

// Safe diagnostic metadata only: never retain URLs, credentials or response bodies.
export class FreightPreferenceUnavailable extends Error {
  constructor(
    readonly reason: 'http' | 'timeout' | 'network' | 'invalid-response',
    readonly upstreamStatus?: number,
  ) {
    super('Unable to save or load shipping preferences.');
  }
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
  }).catch((error: unknown) => {
    throw new FreightPreferenceUnavailable(
      error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'timeout'
        : 'network',
    );
  });

  if (response.status === 409)
    throw new FreightPreferenceConflict(
      'Delivery preferences changed in another tab. Reload preferences and review them.',
    );

  if (!response.ok) throw new FreightPreferenceUnavailable('http', response.status);

  try {
    return z
      .object({ preferences: shippingPreferencesSchema.nullable() })
      .parse(await response.json()).preferences;
  } catch {
    throw new FreightPreferenceUnavailable('invalid-response', response.status);
  }
}
