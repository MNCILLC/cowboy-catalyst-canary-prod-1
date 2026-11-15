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
  markerId: number | null;
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
  mark(marker: PickupMarker | null, state: PickupSnapshot): Promise<void>;
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
      await gateway.mark(
        {
          schemaVersion: 1,
          customerId: s.customerId,
          associated: false,
          warehouse,
          originalAddress:
            s.shipping[0] && !sameDestination(s.shipping[0].address, warehouse)
              ? s.shipping[0].address
              : null,
          prepared: false,
        },
        s,
      );
      s = await read();
    }

    if (!s.marker?.associated) {
      await gateway.assign(s.cartVersion);
      s = await read();
      if (!s.marker) fail('Pickup preparation changed. Please retry.');
      await gateway.mark({ ...s.marker, associated: true }, s);
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

  const itemKey = (items: PickupSnapshot['items']) =>
    JSON.stringify([...items].sort((a, b) => a.lineItemEntityId.localeCompare(b.lineItemEntityId)));

  function pickupAddress(billing: PickupAddress): PickupAddress {
    return {
      ...warehouse,
      firstName: billing.firstName,
      lastName: billing.lastName,
      email: billing.email,
      phone: billing.phone,
      company: billing.company,
    };
  }

  function matchesPickup(s: PickupSnapshot, methodName: string, items: string) {
    const consignment = s.shipping[0];

    if (!s.billing || !validSeparateBilling(s.billing, warehouse) || !consignment) return false;

    const address = pickupAddress(s.billing);
    const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const options = consignment.options.filter(
      (o) => o.type.endsWith('pickupinstore') && o.description === methodName && o.cost.value === 0,
    );
    const option = options[0];
    const selected = consignment.selected;

    return (
      itemKey(s.items) === items &&
      sameDestination(consignment.address, address) &&
      // BigCommerce may populate the province name when given its code.
      (address.stateOrProvinceCode
        ? clean(consignment.address.stateOrProvinceCode) === clean(address.stateOrProvinceCode)
        : clean(consignment.address.stateOrProvince) === clean(address.stateOrProvince)) &&
      (['firstName', 'lastName', 'email', 'phone', 'company'] as const).every(
        (key) => clean(consignment.address[key]) === clean(address[key]),
      ) &&
      consignment.lineItemIds.length === s.items.length &&
      s.items.every((i) => consignment.lineItemIds.includes(i.lineItemEntityId)) &&
      options.length === 1 &&
      option !== undefined &&
      selected?.entityId === option.entityId &&
      selected.type.endsWith('pickupinstore') &&
      selected.description === methodName &&
      selected.cost.value === 0
    );
  }

  function isPrepared(s: PickupSnapshot, methodName: string, items: string) {
    return (
      s.marker?.prepared &&
      s.marker.associated &&
      s.marker.preparedItems &&
      JSON.stringify(s.marker.warehouse) === JSON.stringify(warehouse) &&
      itemKey(s.marker.preparedItems) === items &&
      matchesPickup(s, methodName, items)
    );
  }

  async function prepare(
    methodName: string,
    automaticBilling?: PickupAddress | (() => Promise<PickupAddress | undefined>),
  ) {
    let s = await associate();

    if (!validSeparateBilling(s.billing, warehouse)) {
      // The address book is needed only when checkout has no usable billing.
      const candidate =
        typeof automaticBilling === 'function' ? await automaticBilling() : automaticBilling;

      if (candidate && validSeparateBilling(candidate, warehouse)) {
        // The address-book lookup may have taken time. Keep a newer shopper
        // choice and use the latest checkout version before writing.
        s = await read();

        if (!validSeparateBilling(s.billing, warehouse)) {
          await gateway.bill(billingSchema.parse(candidate), s);
          s = await read();
        }
      }
    }

    if (!s.billing || !validSeparateBilling(s.billing, warehouse))
      fail('Confirm your billing address on the cart before continuing with Pickup.');

    const items = itemKey(s.items);

    if (isPrepared(s, methodName, items)) return;

    await gateway.ship(pickupAddress(s.billing), s);
    s = await read();
    if (itemKey(s.items) !== items) fail('Cart items changed. Return to the cart and retry.');

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
    if (!matchesPickup(s, methodName, items))
      fail('Pickup details changed. Return to the cart and retry.');

    if (!s.marker) fail('Pickup preparation changed. Please retry.');
    await gateway.mark({ ...s.marker, warehouse, prepared: true, preparedItems: s.items }, s);
    s = await read();
    if (!isPrepared(s, methodName, items))
      fail('Pickup details changed. Return to the cart and retry.');
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

  await gateway.mark(null, s);
}
