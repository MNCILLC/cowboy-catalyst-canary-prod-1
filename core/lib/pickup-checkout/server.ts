import 'server-only';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { getCartId } from '~/lib/cart';
import { freightCartEnabled, getCartShippingState } from '~/lib/freight-cart/server';
import { loadShippingOriginDetails } from '~/lib/map-section/actions';

import { clearPickup, pickupFlow } from './engine';
import { pickupGateway } from './gateway';
import {
  billingSchema,
  normalizeAddress,
  type PickupBillingState,
  PickupCheckoutError,
  validSeparateBilling,
} from './policy';

export async function pickupCheckoutEnabled() {
  return process.env.PICKUP_CHECKOUT_ENABLED === 'true' && (await freightCartEnabled());
}

const Addresses = graphql(`
  query PickupBillingChoices($after: String) {
    customer {
      email
      firstName
      lastName
      phone
      addresses(first: 50, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            entityId
            firstName
            lastName
            company
            phone
            address1
            address2
            city
            stateOrProvince
            postalCode
            countryCode
          }
        }
      }
    }
    geography {
      countries {
        code
        name
      }
    }
  }
`);

async function warehouseAddress() {
  const origin = await loadShippingOriginDetails();

  if (
    !origin?.fields.address1 ||
    !origin.fields.city ||
    !origin.fields.countryCode ||
    !origin.fields.postalCode
  ) {
    throw new PickupCheckoutError(
      'The pickup warehouse address is unavailable. Please contact the store.',
    );
  }

  return normalizeAddress(origin.fields);
}

async function confirmedPickup(cartId: string, expectedVersion?: number) {
  if (!(await pickupCheckoutEnabled()) || cartId !== (await getCartId()))
    throw new PickupCheckoutError('Your cart changed. Reload the cart.');

  const state = await getCartShippingState(cartId);

  if (
    !state.confirmed ||
    state.preferences?.fulfillmentMethod !== 'pickup' ||
    (expectedVersion !== undefined && state.preferences.version !== expectedVersion)
  ) {
    throw new PickupCheckoutError('Shipping preferences changed. Choose Pickup again and retry.');
  }

  return state.preferences;
}

export async function getPickupBillingState(cartId: string): Promise<PickupBillingState> {
  try {
    const gateway = await pickupGateway(cartId);
    const [snapshot, warehouse] = await Promise.all([gateway.read(), warehouseAddress()]);
    const customerAccessToken = await getSessionCustomerAccessToken();
    const addresses: PickupBillingState['addresses'] = [];
    let countries: PickupBillingState['countries'] = [];
    let after: string | undefined;

    do {
      // Each page depends on the cursor returned by the preceding page.
      // eslint-disable-next-line no-await-in-loop
      const { data } = await client.fetch({
        document: Addresses,
        variables: { after },
        customerAccessToken,
        fetchOptions: { cache: 'no-store' },
      });

      countries = data.geography.countries ?? [];
      if (!data.customer)
        throw new PickupCheckoutError('Sign in to select your pickup billing address.');

      const email = data.customer.email;

      addresses.push(
        ...(data.customer.addresses.edges ?? []).map((e) => ({
          id: e.node.entityId,
          address: normalizeAddress({ ...e.node, email }),
        })),
      );
      after = data.customer.addresses.pageInfo.hasNextPage
        ? (data.customer.addresses.pageInfo.endCursor ?? undefined)
        : undefined;
    } while (after);

    // Reading the cart only proposes an address. Persist it when preparing checkout.
    // A shopper's existing valid billing choice takes priority over saved addresses.
    const usable = addresses.filter((entry) => validSeparateBilling(entry.address, warehouse));
    let address = snapshot.billing;

    if (!validSeparateBilling(address, warehouse)) {
      address = usable.length === 1 ? (usable[0]?.address ?? null) : null;
    }

    return {
      ready: address !== null,
      address,
      addresses,
      countries,
    };
  } catch (error) {
    return {
      ready: false,
      address: null,
      addresses: [],
      countries: [],
      error:
        error instanceof PickupCheckoutError
          ? error.message
          : 'Billing addresses are unavailable. Reload the cart to retry.',
    };
  }
}

export async function savePickupBilling(cartId: string, raw: unknown, preferenceVersion: number) {
  await confirmedPickup(cartId, preferenceVersion);

  const customerAccessToken = await getSessionCustomerAccessToken();
  const { data } = await client.fetch({
    document: Addresses,
    variables: {},
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });

  if (!data.customer) throw new PickupCheckoutError('Sign in before saving your billing address.');

  const address = billingSchema.safeParse({
    ...(typeof raw === 'object' && raw !== null ? raw : {}),
    email: data.customer.email,
  });

  if (!address.success)
    throw new PickupCheckoutError(
      'Complete your billing name, address, country, state/province and postal code.',
    );

  const result = await pickupFlow(
    await pickupGateway(cartId),
    await warehouseAddress(),
    preferenceVersion,
  ).saveBilling(address.data);

  await confirmedPickup(cartId, preferenceVersion);

  return result;
}

const Recovery = graphql(`
  query PickupRecovery($cartId: String!) {
    site {
      cart(entityId: $cartId) {
        lineItems {
          physicalItems {
            entityId
          }
        }
        metafields(namespace: "bc_storefront", keys: ["pickup_checkout"], first: 1) {
          edges {
            node {
              entityId
            }
          }
        }
      }
    }
  }
`);

async function recoveryState(cartId: string) {
  if (cartId !== (await getCartId()))
    throw new PickupCheckoutError('Your cart changed. Reload the cart.');

  const { data } = await client.fetch({
    document: Recovery,
    variables: { cartId },
    customerAccessToken: await getSessionCustomerAccessToken(),
    fetchOptions: { cache: 'no-store' },
  });

  if (!data.site.cart) throw new PickupCheckoutError('Your cart changed. Reload the cart.');

  return data.site.cart;
}

export async function preparePickupCheckout(cartId: string) {
  const cart = await recoveryState(cartId);
  const hasMarker = Boolean(cart.metafields.edges?.length);

  if (!(await pickupCheckoutEnabled()) || !cart.lineItems.physicalItems.length) {
    if (hasMarker) await cleanupPickupCheckout(cartId);

    return;
  }

  const state = await getCartShippingState(cartId);

  if (!state.confirmed || !state.preferences)
    throw new PickupCheckoutError('Confirm your shipping preferences on the cart.');

  if (state.preferences.fulfillmentMethod === 'ship') {
    if (hasMarker) await cleanupPickupCheckout(cartId);

    return;
  }

  const version = state.preferences.version;
  const billing = await getPickupBillingState(cartId);

  if (billing.error) throw new PickupCheckoutError(billing.error);

  await pickupFlow(await pickupGateway(cartId), await warehouseAddress(), version).prepare(
    process.env.PICKUP_SHIPPING_METHOD_NAME?.trim() || 'Pick up at warehouse',
    billing.address ?? undefined,
  );
  await confirmedPickup(cartId, version);
}

export async function cleanupPickupCheckout(cartId: string) {
  const cart = await recoveryState(cartId);

  if (!cart.metafields.edges?.length) return;
  await clearPickup(await pickupGateway(cartId));
}
