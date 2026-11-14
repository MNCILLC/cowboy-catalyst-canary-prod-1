import 'server-only';

import { auth, getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { getCartId } from '~/lib/cart';

import {
  cartShippingMatches,
  cartShippingValue,
  shippingSelectionSchema,
  type ShippingState,
} from './policy';
import { requestCartPreferences } from './transport';

const CartShippingQuery = graphql(`
  query CartShippingQuery($cartId: String!) {
    site {
      cart(entityId: $cartId) {
        entityId
        lineItems {
          physicalItems {
            entityId
          }
        }
        metafields(namespace: "bc_storefront", keys: ["freight_fulfillment"], first: 1) {
          edges {
            node {
              entityId
              value
            }
          }
        }
      }
    }
  }
`);
const CreateCartShipping = graphql(`
  mutation CreateCartShipping($input: CreateCartMetafieldInput!) {
    cart {
      createCartMetafield(input: $input) {
        metafield {
          entityId
          value
        }
        errors {
          __typename
        }
      }
    }
  }
`);
const UpdateCartShipping = graphql(`
  mutation UpdateCartShipping($input: UpdateCartMetafieldInput!) {
    cart {
      updateCartMetafield(input: $input) {
        metafield {
          entityId
          value
        }
        errors {
          __typename
        }
      }
    }
  }
`);

export class CartShippingError extends Error {}

export async function freightCartEnabled() {
  if (process.env.FREIGHT_CART_ENABLED === 'true') return true;

  const enabledUsers = (process.env.FREIGHT_CART_ENABLED_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!enabledUsers.length) return false;

  // Resolve identity on the server for every render, save, and checkout check.
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  return Boolean(session?.user?.customerAccessToken && email && enabledUsers.includes(email));
}

function connection() {
  return {
    url: process.env.FREIGHT_APP_URL ?? '',
    storeHash: process.env.BIGCOMMERCE_STORE_HASH ?? '',
    token: process.env.FREIGHT_APP_CHECKOUT_TOKEN ?? '',
  };
}

async function readCart(cartId: string) {
  const customerAccessToken = await getSessionCustomerAccessToken();
  const { data } = await client.fetch({
    document: CartShippingQuery,
    variables: { cartId },
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });
  const cart = data.site.cart;

  if (!cart || cart.entityId !== cartId)
    throw new CartShippingError('Your cart has changed. Reload the cart and try again.');

  return { cart, customerAccessToken };
}

export async function getCartShippingState(cartId: string): Promise<ShippingState> {
  try {
    const { cart } = await readCart(cartId);
    const preferences = await requestCartPreferences(connection(), cartId);

    return {
      preferences,
      confirmed: cartShippingMatches(cart.metafields.edges?.[0]?.node.value, preferences),
    };
  } catch {
    return {
      preferences: null,
      confirmed: false,
      error: 'Unable to load shipping preferences. Choose Pickup or Ship to retry.',
    };
  }
}

export async function saveCartShipping(cartId: string, raw: unknown) {
  // A client-supplied ID cannot select another shopper's cart or follow an old
  // tab after login/cart replacement. Resolve authority from the signed session.
  if (!(await freightCartEnabled()) || cartId !== (await getCartId()))
    throw new CartShippingError('Your cart has changed. Reload the cart and try again.');

  const selection = shippingSelectionSchema.parse(raw);
  const { cart, customerAccessToken } = await readCart(cartId);

  if (!cart.lineItems.physicalItems.length)
    throw new CartShippingError('This cart does not need shipping.');

  const current = await requestCartPreferences(connection(), cartId);
  const preferences = await requestCartPreferences(connection(), cartId, {
    ...selection,
    accessorials: selection.fulfillmentMethod === 'ship' ? selection.accessorials : [],
    expectedVersion: current?.version ?? 0,
  });

  if (!preferences)
    throw new CartShippingError('Shipping preferences were not saved. Please try again.');

  const metafield = cart.metafields.edges?.[0]?.node;
  const value = cartShippingValue(preferences);
  const data = { key: 'freight_fulfillment', value };
  const result = metafield
    ? (
        await client.fetch({
          document: UpdateCartShipping,
          variables: {
            input: { cartEntityId: cartId, metafieldEntityId: metafield.entityId, data },
          },
          customerAccessToken,
          fetchOptions: { cache: 'no-store' },
        })
      ).data.cart.updateCartMetafield
    : (
        await client.fetch({
          document: CreateCartShipping,
          variables: { input: { cartEntityId: cartId, data } },
          customerAccessToken,
          fetchOptions: { cache: 'no-store' },
        })
      ).data.cart.createCartMetafield;

  if (result.errors.length || result.metafield?.value !== value)
    throw new CartShippingError(
      'Shipping preferences could not be confirmed on your cart. Please retry.',
    );

  // Detect a concurrent tab update or a partial write before enabling checkout.
  const confirmed = await getCartShippingState(cartId);

  if (!confirmed.confirmed || confirmed.preferences?.version !== preferences.version)
    throw new CartShippingError('Shipping preferences changed. Please retry.');

  return preferences;
}

export async function assertCartShipping(cartId: string): Promise<ShippingState | undefined> {
  if (!(await freightCartEnabled())) return;

  const { cart } = await readCart(cartId);

  if (!cart.lineItems.physicalItems.length) return;

  let preferences;

  try {
    preferences = await requestCartPreferences(connection(), cartId);
  } catch {
    throw new CartShippingError(
      'Shipping preferences are unavailable. Return to the cart and retry.',
    );
  }

  if (!cartShippingMatches(cart.metafields.edges?.[0]?.node.value, preferences)) {
    throw new CartShippingError('Select Pickup or Ship to continue');
  }

  return { confirmed: true, preferences };
}
