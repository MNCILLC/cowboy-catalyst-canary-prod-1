import { z } from 'zod';

export const deliveryServices = [
  { code: 'HYD', label: 'Liftgate Delivery' },
  { code: 'ARN', label: 'Delivery Notification' },
  { code: 'IDC', label: 'Inside Delivery' },
  { code: 'LDC', label: 'Limited Access Delivery' },
] as const;

export const shippingSelectionSchema = z
  .object({
    fulfillmentMethod: z.enum(['pickup', 'ship']),
    accessorials: z.array(z.enum(['HYD', 'ARN', 'IDC', 'LDC'])).max(4),
  })
  .strict();
export const shippingPreferencesSchema = shippingSelectionSchema.extend({
  version: z.number().int().positive(),
});
export type ShippingSelection = z.infer<typeof shippingSelectionSchema>;
export type ShippingPreferences = z.infer<typeof shippingPreferencesSchema>;
export type ShippingSaveResult = { preferences: ShippingPreferences } | { error: string };
export interface ShippingState {
  preferences: ShippingPreferences | null;
  confirmed: boolean;
  error?: string;
}

export function cartShippingValue(preferences: ShippingPreferences) {
  return JSON.stringify({
    fulfillmentMethod: preferences.fulfillmentMethod,
    version: preferences.version,
  });
}

export function cartShippingMatches(
  value: string | undefined,
  preferences: ShippingPreferences | null,
) {
  if (!value || !preferences) return false;

  try {
    const saved = z
      .object({ fulfillmentMethod: z.enum(['pickup', 'ship']), version: z.number().int() })
      .parse(JSON.parse(value));

    return (
      saved.fulfillmentMethod === preferences.fulfillmentMethod &&
      saved.version === preferences.version
    );
  } catch {
    return false;
  }
}
