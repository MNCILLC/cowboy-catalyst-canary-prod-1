import { z } from 'zod';

// Public display data only. Stock checks at cart mutation/submission remain authoritative.
export const warehouseAvailabilitySchema = z.object({
  message: z.string(),
  status: z.enum(['error', 'success']).optional(),
  canPurchase: z.boolean(),
  quantity: z.number().optional(),
  selectionRequired: z.enum(['warehouse', 'options']).optional(),
});
export type WarehouseAvailability = z.infer<typeof warehouseAvailabilitySchema>;
export interface AvailabilityProduct {
  id: number;
  type: string;
  inventory_tracking: string;
}
export interface AvailabilityItem {
  identity: { product_id: number; variant_id: number | null };
  available_to_sell: number;
  settings?: { is_in_stock?: boolean };
}

export const unknownAvailability = (): WarehouseAvailability => ({
  message: 'Warehouse availability is temporarily unavailable. Please retry.',
  canPurchase: false,
});

export function describeWarehouseAvailability(
  product: AvailabilityProduct | undefined,
  items: AvailabilityItem[],
  cityState: string | undefined,
  variantId?: number,
  useInStockMessage = false,
): WarehouseAvailability {
  if (!product) return unknownAvailability();
  if (product.type === 'digital')
    return { message: 'Digital product — no warehouse stock required.', canPurchase: true };

  const locationSuffix = cityState ? ` · ${cityState}` : '';

  if (!['product', 'variant'].includes(product.inventory_tracking))
    return {
      message: `Warehouse availability is not configured for this product${locationSuffix}.`,
      canPurchase: false,
    };

  const rows = items.filter((row) => row.identity.product_id === product.id);
  const quantity = (row: AvailabilityItem | undefined) => {
    if (!row) return 0;
    if (!Number.isFinite(row.available_to_sell)) return undefined;

    return row.settings?.is_in_stock === false ? 0 : Math.max(0, row.available_to_sell);
  };

  if (product.inventory_tracking === 'variant' && variantId === undefined) {
    if (rows.some((row) => quantity(row) === undefined)) return unknownAvailability();

    const optionsAvailable = rows.some(
      (row) => row.identity.variant_id !== null && (quantity(row) ?? 0) > 0,
    );

    return {
      message: optionsAvailable
        ? `Options available${locationSuffix}. Choose options to check stock.`
        : `Out of stock${locationSuffix}`,
      status: optionsAvailable ? undefined : 'error',
      canPurchase: false,
      selectionRequired: optionsAvailable ? 'options' : undefined,
    };
  }

  // Never add variants together or borrow inventory from another option/location.
  const matching =
    product.inventory_tracking === 'variant'
      ? rows.filter((row) => row.identity.variant_id === variantId)
      : rows;

  if (matching.length > 1) return unknownAvailability();

  const available = quantity(matching[0]);

  if (available === undefined) return unknownAvailability();

  const inStockMessage = useInStockMessage ? 'IN STOCK' : `${available} available`;

  return {
    message: `${available > 0 ? inStockMessage : 'Out of stock'}${locationSuffix}`,
    status: available > 0 ? 'success' : 'error',
    canPurchase: available > 0,
    quantity: available,
  };
}

export function warehouseCardDisplay(availability: WarehouseAvailability | undefined) {
  return availability
    ? {
        inventoryMessage: availability.message,
        useEnhancedStockDisplay: true,
        stockDisplayData: {
          stockLevelMessage: availability.message,
          stockLevelStatus: availability.status,
          backorderAvailabilityPrompt: null,
        },
        isInStock:
          availability.status === undefined ? undefined : availability.status === 'success',
      }
    : {};
}
