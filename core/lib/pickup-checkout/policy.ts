import { z } from 'zod';

const text = z.string().trim().max(250).default('');

export const addressSchema = z.object({
  firstName: text,
  lastName: text,
  email: z.string().trim().max(254).default(''),
  company: text,
  phone: z.string().trim().max(50).default(''),
  address1: text,
  address2: text,
  city: text,
  stateOrProvince: text,
  stateOrProvinceCode: text,
  postalCode: z.string().trim().max(30).default(''),
  countryCode: z.string().trim().toUpperCase().max(2).default(''),
});
export type PickupAddress = z.infer<typeof addressSchema>;
export const billingSchema = addressSchema.superRefine((a, ctx) => {
  (['firstName', 'lastName', 'address1', 'city', 'countryCode'] as const).forEach((key) => {
    if (!a[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required' });
  });

  if (!z.string().email().safeParse(a.email).success)
    ctx.addIssue({
      code: 'custom',
      path: ['email'],
      message: 'A valid customer email is required',
    });

  if (
    ['US', 'CA'].includes(a.countryCode) &&
    (!a.postalCode || !(a.stateOrProvince || a.stateOrProvinceCode))
  ) {
    ctx.addIssue({ code: 'custom', message: 'State/province and postal code are required' });
  }
});
export const markerSchema = z.object({
  schemaVersion: z.literal(1),
  customerId: z.number().int().positive(),
  associated: z.boolean(),
  warehouse: addressSchema,
  originalAddress: addressSchema.nullable(),
  prepared: z.boolean(),
  // Older markers take the full preparation path once before they can be reused.
  preparedItems: z
    .array(
      z.object({
        lineItemEntityId: z.string(),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(),
});
export type PickupMarker = z.infer<typeof markerSchema>;
export class PickupCheckoutError extends Error {}

export function normalizeAddress(raw: Record<string, unknown>): PickupAddress {
  return addressSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? ''])));
}

export function sameDestination(a: PickupAddress, b: PickupAddress) {
  const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  return (['address1', 'address2', 'city', 'postalCode', 'countryCode'] as const).every(
    (key) => clean(a[key]) === clean(b[key]),
  );
}

export function validSeparateBilling(address: PickupAddress | null, warehouse: PickupAddress) {
  return (
    address !== null &&
    billingSchema.safeParse(address).success &&
    !sameDestination(address, warehouse)
  );
}

export interface PickupBillingState {
  ready: boolean;
  address: PickupAddress | null;
  addresses: Array<{ id: number; address: PickupAddress }>;
  countries: Array<{ code: string; name: string }>;
  error?: string;
}
export type PickupBillingResult = { address: PickupAddress } | { error: string };
