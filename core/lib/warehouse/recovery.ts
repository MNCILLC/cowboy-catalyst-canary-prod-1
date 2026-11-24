import 'server-only';

import { Redis } from '@upstash/redis';

import { WarehouseValidationError } from './authorization';
import { testPaymentAttemptKey } from './check-test';
import { getWarehouseConfiguration } from './config';
import { authenticateWarehouseAccess } from './validation';

// No order lookup, grant issuance, claim mutation or reset. A tombstone proves an attempt,
// never payment success/failure. Authenticate before any Redis access or status disclosure.
export async function readSubmissionRecovery(
  token: string,
  origin: string,
  cartId: string,
  revision: string,
): Promise<boolean> {
  const claims = authenticateWarehouseAccess(token, origin, cartId, revision);

  const { mode } = getWarehouseConfiguration();

  if (
    mode !== 'staging' &&
    !(mode === 'development' && process.env.WAREHOUSE_TEST_PROVIDER_POLICY !== undefined)
  )
    return false;

  try {
    if (!process.env.WAREHOUSE_REDIS_URL || !process.env.WAREHOUSE_REDIS_TOKEN)
      throw new Error('Recovery storage is not configured.');

    const redis = new Redis({
      url: process.env.WAREHOUSE_REDIS_URL,
      token: process.env.WAREHOUSE_REDIS_TOKEN,
      retry: false,
      enableAutoPipelining: false,
      automaticDeserialization: false,
      enableTelemetry: false,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const value = await redis.get(
      testPaymentAttemptKey(process.env.WAREHOUSE_REDIS_NAMESPACE ?? '', claims),
    );

    // Even an unparseable non-null tombstone must never reopen purchasing.
    return value !== null;
  } catch {
    throw new WarehouseValidationError(
      'Cannot verify submission status. Do not place an order until verification is available.',
      503,
      'RECOVERY_UNAVAILABLE',
    );
  }
}
