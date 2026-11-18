import { Warehouse, WarehouseConsignment, warehouseFulfillmentCompatible } from './policy';

// Public, non-PII contract. A different backend can implement the same snapshot.
export interface SubmissionSnapshot {
  grandTotal: number;
  items: Array<{ id: string; productId: number; variantId: number; quantity: number }>;
  consignments: Array<{
    id: string;
    lineItemIds: string[];
    pickupMethodId: number | null;
    shippingOptionId: string | null;
  }>;
}

export interface SubmissionCheckout {
  grand_total: number;
  cart: {
    line_items: {
      physical_items: Array<{
        id: string;
        product_id: number;
        variant_id: number;
        quantity: number;
      }>;
    };
  };
  consignments: WarehouseConsignment[];
}

export function submissionSnapshot(checkout: SubmissionCheckout): SubmissionSnapshot {
  return {
    grandTotal: checkout.grand_total,
    items: checkout.cart.line_items.physical_items
      .map((item) => ({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    consignments: checkout.consignments
      .map((consignment) => ({
        id: consignment.id,
        lineItemIds: [...consignment.line_item_ids].sort(),
        pickupMethodId: consignment.selected_pickup_option?.pickup_method_id ?? null,
        shippingOptionId: consignment.selected_shipping_option?.id ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function submissionReady(warehouse: Warehouse, checkout: SubmissionCheckout): boolean {
  const items = checkout.cart.line_items.physical_items;
  const consignments = checkout.consignments;

  return (
    items.length > 0 &&
    consignments.length === 1 &&
    warehouseFulfillmentCompatible(
      warehouse,
      items.map((item) => item.id),
      consignments,
    ) &&
    consignments.every((consignment) =>
      consignment.selected_pickup_option
        ? !consignment.selected_shipping_option
        : !!consignment.selected_shipping_option?.id,
    )
  );
}

export function submissionMatches(
  warehouse: Warehouse,
  checkout: SubmissionCheckout,
  expected: SubmissionSnapshot,
  requestedMode?: 'pickup' | 'shipping',
) {
  return (
    !requestedMode &&
    submissionReady(warehouse, checkout) &&
    JSON.stringify(submissionSnapshot(checkout)) === JSON.stringify(expected)
  );
}
