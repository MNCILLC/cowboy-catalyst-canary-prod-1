import {
  billingSchema,
  type PickupAddress,
  PickupCheckoutError,
  type PickupMarker,
  sameDestination,
  validSeparateBilling,
} from './policy';

export interface ShippingOption {
  entityId: string;
  description: string;
  type: string;
  cost: { value: number };
}
export interface PickupSnapshot {
  cartVersion: number;
  checkoutVersion: number;
  customerId: number;
  method: string | null;
  preferenceVersion: number | null;
  billing: PickupAddress | null;
  billingId: string | null;
  marker: PickupMarker | null;
  items: Array<{ lineItemEntityId: string; quantity: number }>;
  shipping: Array<{
    id: string;
    address: PickupAddress;
    lineItemIds: string[];
    options: ShippingOption[];
    selected: ShippingOption | null;
  }>;
}
export interface PickupGateway {
  read(): Promise<PickupSnapshot>;
  mark(marker: PickupMarker | null): Promise<void>;
  assign(version: number): Promise<void>;
  bill(address: PickupAddress, state: PickupSnapshot): Promise<void>;
  ship(address: PickupAddress, state: PickupSnapshot): Promise<void>;
  select(id: string, optionId: string, version: number): Promise<void>;
  remove(id: string, version: number): Promise<void>;
}

function fail(message: string): never {
  throw new PickupCheckoutError(message);
}

export function pickupFlow(
  gateway: PickupGateway,
  warehouse: PickupAddress,
  preferenceVersion: number,
) {
  async function read() {
    const s = await gateway.read();

    if (s.method !== 'pickup' || s.preferenceVersion !== preferenceVersion)
      fail('Shipping preferences changed. Return to the cart and retry.');
    if (!s.customerId) fail('Sign in before preparing warehouse pickup.');
    if (!s.items.length) fail('This cart does not need warehouse pickup.');
    if (s.shipping.length > 1)
      fail('Pickup requires one shipping destination. Review your cart before continuing.');
    if (s.marker && s.marker.customerId !== s.customerId)
      fail('Your account changed. Return to the cart and choose shipping again.');

    return s;
  }

  async function associate() {
    let s = await read();
    const billing = s.billing;

    if (!s.marker) {
      await gateway.mark({
        schemaVersion: 1,
        customerId: s.customerId,
        associated: false,
        warehouse,
        originalAddress:
          s.shipping[0] && !sameDestination(s.shipping[0].address, warehouse)
            ? s.shipping[0].address
            : null,
        prepared: false,
      });
      s = await read();
    }

    if (!s.marker?.associated) {
      await gateway.assign(s.cartVersion);
      s = await read();
      if (!s.marker) fail('Pickup preparation changed. Please retry.');
      await gateway.mark({ ...s.marker, associated: true });
      s = await read();

      if (billing && billingSchema.safeParse(billing).success && !s.billing?.address1) {
        await gateway.bill(billing, s);
        s = await read();
      }
    }

    return s;
  }

  async function saveBilling(address: PickupAddress) {
    if (!validSeparateBilling(address, warehouse))
      fail('Enter your billing address, separate from the pickup warehouse.');

    const s = await associate();

    await gateway.bill(billingSchema.parse(address), s);

    const after = await read();

    if (!after.billing || !sameDestination(after.billing, address))
      fail('Billing could not be confirmed. Please retry.');

    return after.billing;
  }

  async function prepare(methodName: string) {
    let s = await associate();

    if (!s.billing || !validSeparateBilling(s.billing, warehouse))
      fail('Confirm your billing address on the cart before continuing with Pickup.');

    const billing = s.billing;
    // Contact details are the shopper's; only the destination is the warehouse.
    const pickupAddress = {
      ...warehouse,
      firstName: billing.firstName,
      lastName: billing.lastName,
      email: billing.email,
      phone: billing.phone,
      company: billing.company,
    };
    const items = JSON.stringify(s.items);

    await gateway.ship(pickupAddress, s);
    s = await read();
    if (JSON.stringify(s.items) !== items)
      fail('Cart items changed. Return to the cart and retry.');

    const consignment = s.shipping[0];

    if (!consignment || !sameDestination(consignment.address, warehouse))
      fail('Warehouse address could not be confirmed. Please retry.');

    const options = consignment.options.filter(
      (o) => o.type.endsWith('pickupinstore') && o.description === methodName && o.cost.value === 0,
    );

    const option = options[0];

    if (options.length !== 1 || !option)
      fail('The $0 warehouse pickup method is unavailable. Please contact the store.');
    await gateway.select(consignment.id, option.entityId, s.checkoutVersion);
    s = await read();

    const selected = s.shipping[0];

    if (
      JSON.stringify(s.items) !== items ||
      !selected ||
      selected.selected?.entityId !== option.entityId ||
      selected.selected.cost.value !== 0 ||
      !sameDestination(selected.address, warehouse) ||
      !validSeparateBilling(s.billing, warehouse) ||
      selected.lineItemIds.length !== s.items.length ||
      s.items.some((i) => !selected.lineItemIds.includes(i.lineItemEntityId))
    ) {
      fail('Pickup details changed. Return to the cart and retry.');
    }

    if (!s.marker) fail('Pickup preparation changed. Please retry.');
    await gateway.mark({ ...s.marker, warehouse, prepared: true });
    await read();
  }

  return { saveBilling, prepare };
}

// Runs even with the feature flag off, so already-prepared carts can recover.
export async function clearPickup(gateway: PickupGateway) {
  let s = await gateway.read();
  const marker = s.marker;

  if (!marker) return;
  if (marker.customerId !== s.customerId)
    fail('Your account changed. Reload the cart before changing fulfillment.');
  if (s.shipping.length > 1)
    fail('Review the cart shipping destinations before changing fulfillment.');

  const shipping = s.shipping[0];

  // Do not overwrite a shopper's later edit in hosted checkout.
  const interruptedRestore =
    shipping &&
    marker.originalAddress &&
    sameDestination(shipping.address, marker.originalAddress) &&
    shipping.selected?.type.endsWith('pickupinstore');

  if (!shipping || sameDestination(shipping.address, marker.warehouse) || interruptedRestore) {
    if (marker.originalAddress && s.items.length) {
      // Updating an address can retain the selected Pickup option in BigCommerce.
      // Recreate the consignment so Ship must obtain a fresh shipping selection.
      // The marker survives both steps, making a failure between them recoverable.
      if (shipping) {
        await gateway.remove(shipping.id, s.checkoutVersion);
        s = await gateway.read();
        if (s.shipping.length) fail('Pickup could not be cleared. Please retry.');
      }

      await gateway.ship(marker.originalAddress, s);
      s = await gateway.read();

      if (
        !s.shipping[0] ||
        !sameDestination(s.shipping[0].address, marker.originalAddress) ||
        s.shipping[0].selected?.type.endsWith('pickupinstore')
      ) {
        fail('Shipping could not be restored. Please retry before continuing.');
      }
    } else if (shipping) {
      await gateway.remove(shipping.id, s.checkoutVersion);
      s = await gateway.read();
      if (s.shipping.some((c) => sameDestination(c.address, marker.warehouse)))
        fail('Pickup could not be cleared. Please retry.');
    }
  }

  await gateway.mark(null);
}
