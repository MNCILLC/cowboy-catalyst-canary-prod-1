import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { WarehouseError } from './policy';

export class WarehouseValidationError extends WarehouseError {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const recordSchema = z
  .object({
    version: z.literal(1),
    storeHash: z.string().min(1),
    channelId: z.number().int().positive(),
    cartId: z.string().uuid(),
    warehouseId: z.string().min(1),
    revision: z.string().uuid(),
  })
  .strict();

export type WarehouseRecord = z.infer<typeof recordSchema>;

const claimsSchema = recordSchema
  .extend({
    purpose: z.literal('warehouse-validation'),
    origin: z.string().url(),
    exp: z.number().int(),
  })
  .strict();

export type ValidationClaims = z.infer<typeof claimsSchema>;

export function signValidationClaims(claims: ValidationClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyValidationClaims(
  token: string,
  secret: string,
  origin: string,
  now = Date.now(),
): ValidationClaims {
  const invalid = () =>
    new WarehouseValidationError(
      'Checkout authorization expired or is invalid. Return to your cart.',
      401,
      'UNAUTHORIZED',
    );
  const parts = token.split('.');

  if (parts.length !== 2 || token.length > 4096) throw invalid();

  const [payload = '', signature = ''] = parts;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');

  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw invalid();

  let claims: ValidationClaims;

  try {
    claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  } catch {
    throw invalid();
  }

  if (claims.exp <= Math.floor(now / 1000) || claims.origin !== origin) throw invalid();

  return claims;
}

export function assertCurrentRecord(
  record: WarehouseRecord | undefined,
  expected: WarehouseRecord,
) {
  if (
    !record ||
    record.storeHash !== expected.storeHash ||
    record.channelId !== expected.channelId ||
    record.cartId !== expected.cartId ||
    record.warehouseId !== expected.warehouseId ||
    record.revision !== expected.revision
  ) {
    throw new WarehouseValidationError(
      'Your cart warehouse changed in another tab. Return to your cart and open checkout again.',
      409,
      'STALE_WAREHOUSE',
    );
  }
}
