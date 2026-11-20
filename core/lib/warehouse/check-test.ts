import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import type { WarehouseRedis } from './atomic/persistence';
import { WarehouseValidationError } from './authorization';

const policySchema = z
  .object({
    id: z.string().uuid(),
    storeHash: z.string().min(1),
    channelId: z.number().int().positive(),
    cartId: z.string().uuid(),
    customerId: z.number().int().positive(),
    warehouseId: z.string().min(1),
    revision: z.string().uuid(),
    productId: z.number().int().positive(),
    variantId: z.number().int().nonnegative(),
    quantity: z.literal(1),
    grandTotal: z.number().finite().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type CheckTestPolicy = z.infer<typeof policySchema>;
export interface CheckTestAuthorization {
  version: 1;
  methodId: 'cheque';
  token: string;
  expiresAt: number;
}
export interface CheckTestClaim {
  token: string;
  methodId: string;
  gatewayId: string | null;
}

export function checkTestDenied(message = 'Check test authorization is unavailable.') {
  return new WarehouseValidationError(message, 409, 'CHECK_TEST_BLOCKED');
}

// No environment reads, network calls, or mutations. Missing configuration is disabled.
export function readCheckTestPolicy(encoded: string | undefined, now = Date.now()) {
  if (!encoded) return undefined;

  try {
    const policy = policySchema.parse(JSON.parse(encoded));
    const seconds = Math.floor(now / 1000);

    if (policy.expiresAt <= seconds || policy.expiresAt > seconds + 900) throw checkTestDenied();

    return policy;
  } catch {
    throw checkTestDenied();
  }
}

export function checkTestAuthorization(
  policy: CheckTestPolicy,
  origin: string,
  secret: string,
): CheckTestAuthorization {
  if (secret.length < 32) throw checkTestDenied();

  const payload = Buffer.from(
    JSON.stringify({ purpose: 'warehouse-check-test-v1', origin, policy }),
  ).toString('base64url');
  const signature = createHmac('sha256', `warehouse-check-test-v1:${secret}`)
    .update(payload)
    .digest('base64url');

  return {
    version: 1,
    methodId: 'cheque',
    token: `${payload}.${signature}`,
    expiresAt: policy.expiresAt,
  };
}

export function verifyCheckTestClaim(
  policy: CheckTestPolicy,
  origin: string,
  secret: string,
  claim: CheckTestClaim,
) {
  if (claim.methodId !== 'cheque' || claim.gatewayId !== null)
    throw checkTestDenied('Only Check is authorized for this test.');

  const expected = Buffer.from(checkTestAuthorization(policy, origin, secret).token);
  const actual = Buffer.from(claim.token);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw checkTestDenied();
}

// Persistent cart-scoped tombstone, intentionally without a TTL or release/replay path.
// Even a lost response consumes the attempt. Reconciliation is an operator action.
export const CLAIM_CHECK_TEST_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
return 1
`;

export async function claimCheckTestAttempt(
  redis: WarehouseRedis,
  namespace: string,
  policy: Pick<CheckTestPolicy, 'id' | 'storeHash' | 'channelId' | 'cartId'>,
  fingerprint: string,
) {
  const key = testPaymentAttemptKey(namespace, policy);
  let result: unknown;

  try {
    result = await redis.eval(
      CLAIM_CHECK_TEST_SCRIPT,
      [key],
      [JSON.stringify({ grantId: policy.id, fingerprint, claimedAt: Date.now() })],
    );
  } catch {
    throw checkTestDenied(
      'Order status is uncertain. Do not submit again. Contact the store to confirm the outcome.',
    );
  }

  if (result !== 1)
    throw checkTestDenied(
      'This test cart already has an attempt. Do not submit again. Contact the store to confirm the outcome.',
    );
}

// Shared identity for read-only recovery and the permanent Check/Test provider claim.
export function testPaymentAttemptKey(
  namespace: string,
  scope: Pick<CheckTestPolicy, 'storeHash' | 'channelId' | 'cartId'>,
) {
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace)) throw checkTestDenied();

  const identity = createHash('sha256')
    .update(JSON.stringify([scope.storeHash, scope.channelId, scope.cartId]))
    .digest('hex');

  return `${namespace}:check-test:v1:${identity}`;
}
