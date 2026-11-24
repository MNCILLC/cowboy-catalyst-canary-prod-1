import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import type { CheckTestAuthorization, CheckTestClaim } from './check-test';
import {
  type TestProviderAuthorization,
  type TestProviderClaim,
  testProviderDenied,
} from './test-provider';

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);

    return url.protocol === 'https:' && url.origin === value;
  });
const policySchema = z.object({
  enabled: z.literal(true),
  version: z.literal(1),
  id: z.string().uuid(),
  methodId: z.literal('bigpaypay'),
  testMode: z.literal(true),
  allowLocalCheck: z.boolean().optional(),
  storeHash: z.string().min(1),
  channelId: z.number().int().positive(),
  origins: z.array(originSchema).min(1),
  warehouseIds: z.array(z.string().min(1)).min(1),
  currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
  grantTtlSeconds: z.number().int().min(30).max(900),
});

// Accept saved policies from earlier deployments, but omit their retired caps
// from the effective policy and the hash used to sign new grants.
const savedPolicySchema = policySchema
  .extend({
    maxLineItems: z.number().int().min(1).max(100).optional(),
    maxQuantity: z.number().int().positive().safe().optional(),
    maxGrandTotal: z.number().finite().positive().optional(),
  })
  .strict()
  .pipe(policySchema);

export type NormalTestProviderPolicy = z.infer<typeof policySchema>;
export interface NormalTestProviderBinding {
  origin: string;
  cartId: string;
  revision: string;
  warehouseId: string;
  customerId: number;
  currency: string;
  snapshotHash: string;
}

export function readNormalTestProviderPolicy(encoded: string | undefined) {
  if (!encoded) return undefined;

  try {
    const value: unknown = JSON.parse(encoded);

    if (
      z
        .object({ enabled: z.literal(false) })
        .strict()
        .safeParse(value).success
    )
      return undefined;

    return savedPolicySchema.parse(value);
  } catch {
    throw testProviderDenied();
  }
}

export function testProviderHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const cardPurpose = 'warehouse-normal-test-provider-v1';
const checkPurpose = 'warehouse-local-check-v1';

function signedToken(payload: string, secret: string, purpose: string) {
  if (secret.length < 32) throw testProviderDenied();

  return `${payload}.${createHmac('sha256', `${purpose}:${secret}`).update(payload).digest('base64url')}`;
}

export function normalTestProviderAuthorization(
  policy: NormalTestProviderPolicy,
  binding: NormalTestProviderBinding,
  secret: string,
  now = Date.now(),
): TestProviderAuthorization {
  return {
    version: 1,
    methodId: 'bigpaypay',
    testMode: true,
    ...issueToken(policy, binding, secret, cardPurpose, now),
  };
}

export function normalCheckAuthorization(
  policy: NormalTestProviderPolicy,
  binding: NormalTestProviderBinding,
  secret: string,
  claim?: CheckTestClaim,
): CheckTestAuthorization {
  if (
    !policy.allowLocalCheck ||
    (claim && (claim.methodId !== 'cheque' || claim.gatewayId !== null))
  )
    throw testProviderDenied();

  const grant = claim
    ? verifyToken(policy, binding, secret, checkPurpose, claim.token, Date.now())
    : issueToken(policy, binding, secret, checkPurpose, Date.now());

  return { version: 1, methodId: 'cheque', ...grant };
}

function issueToken(
  policy: NormalTestProviderPolicy,
  binding: NormalTestProviderBinding,
  secret: string,
  purpose: string,
  now: number,
) {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + policy.grantTtlSeconds;
  const payload = Buffer.from(
    JSON.stringify({
      purpose,
      policyHash: testProviderHash(policy),
      binding,
      issuedAt,
      expiresAt,
    }),
  ).toString('base64url');

  return {
    token: signedToken(payload, secret, purpose),
    expiresAt,
  };
}

export function verifyNormalTestProviderClaim(
  policy: NormalTestProviderPolicy,
  binding: NormalTestProviderBinding,
  secret: string,
  claim: TestProviderClaim,
  now = Date.now(),
): TestProviderAuthorization {
  if (
    claim.methodId !== 'bigpaypay' ||
    claim.gatewayId !== null ||
    claim.usesStoredInstrument ||
    claim.shouldSaveInstrument
  )
    throw testProviderDenied();

  return {
    version: 1,
    methodId: 'bigpaypay',
    testMode: true,
    ...verifyToken(policy, binding, secret, cardPurpose, claim.token, now),
  };
}

function verifyToken(
  policy: NormalTestProviderPolicy,
  binding: NormalTestProviderBinding,
  secret: string,
  purpose: string,
  token: string,
  now: number,
) {
  if (token.length > 4096) throw testProviderDenied();

  try {
    const payload = token.split('.')[0];

    if (!payload) throw testProviderDenied();

    const expected = Buffer.from(signedToken(payload, secret, purpose));
    const actual = Buffer.from(token);

    if (expected.length !== actual.length || !timingSafeEqual(actual, expected))
      throw testProviderDenied();

    const data = z
      .object({
        purpose: z.literal(purpose),
        policyHash: z.literal(testProviderHash(policy)),
        binding: z.unknown(),
        issuedAt: z.number().int().nonnegative(),
        expiresAt: z.number().int().positive(),
      })
      .strict()
      .parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    const seconds = Math.floor(now / 1000);

    if (
      JSON.stringify(data.binding) !== JSON.stringify(binding) ||
      data.issuedAt > seconds ||
      data.expiresAt <= seconds ||
      data.expiresAt - data.issuedAt !== policy.grantTtlSeconds
    )
      throw testProviderDenied();

    return {
      token,
      expiresAt: data.expiresAt,
    };
  } catch {
    throw testProviderDenied();
  }
}
