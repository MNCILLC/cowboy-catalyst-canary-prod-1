import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { WarehouseValidationError } from './authorization';

const policySchema = z
  .object({
    methodId: z.literal('bigpaypay'),
    testMode: z.literal(true),
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

export type TestProviderPolicy = z.infer<typeof policySchema>;
export interface TestProviderAuthorization {
  version: 1;
  methodId: 'bigpaypay';
  testMode: true;
  token: string;
  expiresAt: number;
}
export interface TestProviderClaim {
  token: string;
  methodId: string;
  gatewayId: string | null;
  usesStoredInstrument: boolean;
  shouldSaveInstrument: boolean;
}

export function testProviderDenied(
  message = 'Test payment provider authorization is unavailable.',
) {
  return new WarehouseValidationError(message, 409, 'TEST_PROVIDER_BLOCKED');
}

// No environment reads, network calls, or mutations. Missing configuration is disabled.
export function readTestProviderPolicy(encoded: string | undefined, now = Date.now()) {
  if (!encoded) return undefined;

  try {
    const policy = policySchema.parse(JSON.parse(encoded));
    const seconds = Math.floor(now / 1000);

    if (policy.expiresAt <= seconds || policy.expiresAt > seconds + 900) throw testProviderDenied();

    return policy;
  } catch {
    throw testProviderDenied();
  }
}

export function testProviderAuthorization(
  policy: TestProviderPolicy,
  origin: string,
  secret: string,
): TestProviderAuthorization {
  if (secret.length < 32) throw testProviderDenied();

  const payload = Buffer.from(
    JSON.stringify({ purpose: 'warehouse-test-provider-v1', origin, policy }),
  ).toString('base64url');
  const signature = createHmac('sha256', `warehouse-test-provider-v1:${secret}`)
    .update(payload)
    .digest('base64url');

  return {
    version: 1,
    methodId: 'bigpaypay',
    testMode: true,
    token: `${payload}.${signature}`,
    expiresAt: policy.expiresAt,
  };
}

export function verifyTestProviderClaim(
  policy: TestProviderPolicy,
  origin: string,
  secret: string,
  claim: TestProviderClaim,
) {
  if (
    claim.methodId !== 'bigpaypay' ||
    claim.gatewayId !== null ||
    claim.usesStoredInstrument ||
    claim.shouldSaveInstrument
  )
    throw testProviderDenied('Only the Test payment provider is authorized for this test.');

  const expected = Buffer.from(testProviderAuthorization(policy, origin, secret).token);
  const actual = Buffer.from(claim.token);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw testProviderDenied();
}

// Share Check's durable tombstone: changing methods never grants a second cart attempt.
export { claimCheckTestAttempt as claimTestProviderAttempt } from './check-test';
