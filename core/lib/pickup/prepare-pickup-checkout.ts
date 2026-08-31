import 'server-only';

import { z } from 'zod';

const pickupMethodsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().int().positive(),
      location_id: z.number().int().positive(),
    }),
  ),
});

const checkoutResponseSchema = z.object({
  data: z.object({
    cart: z.object({
      line_items: z.object({
        physical_items: z.array(
          z.object({
            id: z.string().min(1),
            quantity: z.number().int().positive(),
          }),
        ),
      }),
    }),
    consignments: z.array(
      z.object({
        id: z.string().min(1),
        pickup_option: z.object({ pickup_method_id: z.number().int().positive() }).nullish(),
        line_item_ids: z.array(z.string()).optional(),
      }),
    ),
  }),
});

export class PickupCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PickupCheckoutError';
  }
}

async function getPickupMethodId(baseUrl: string, headers: HeadersInit, locationId: number) {
  const pickupMethodsResponse = await managementFetch(`${baseUrl}/v3/pickup/methods?limit=100`, {
    headers,
  });
  const pickupMethods = pickupMethodsResponseSchema.parse(await pickupMethodsResponse.json()).data;
  const pickupMethod = pickupMethods.find((method) => method.location_id === locationId);

  if (!pickupMethod) {
    throw new PickupCheckoutError(
      `No BigCommerce pickup method is configured for location ${locationId}.`,
    );
  }

  return pickupMethod.id;
}

export async function getLocationPickupMethodId(locationId: number): Promise<number> {
  const { baseUrl, headers } = getManagementApiConfig();

  return getPickupMethodId(baseUrl, headers, locationId);
}

export async function prepareShippingCheckout(checkoutId: string): Promise<void> {
  const { baseUrl, headers } = getManagementApiConfig();
  const encodedCheckoutId = encodeURIComponent(checkoutId);
  const checkoutResponse = await managementFetch(`${baseUrl}/v3/checkouts/${encodedCheckoutId}`, {
    headers,
  });
  const checkout = checkoutResponseSchema.parse(await checkoutResponse.json()).data;

  await Promise.all(
    checkout.consignments
      .filter(({ pickup_option: pickupOption }) => pickupOption)
      .map(({ id }) =>
        managementFetch(
          `${baseUrl}/v3/checkouts/${encodedCheckoutId}/consignments/${encodeURIComponent(id)}`,
          { method: 'DELETE', headers },
        ),
      ),
  );
}

function getManagementApiConfig() {
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;

  if (!accessToken || !storeHash) {
    throw new PickupCheckoutError(
      'BigCommerce Management API credentials are required to prepare pickup checkout.',
    );
  }

  return {
    baseUrl: `https://api.bigcommerce.com/stores/${storeHash}`,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Auth-Token': accessToken,
    },
  };
}

async function managementFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, cache: 'no-store' });

  if (!response.ok) {
    const detail = await response.text();

    throw new PickupCheckoutError(
      `BigCommerce pickup checkout request failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  return response;
}

/**
 * Assigns every physical cart line to the pickup method for the shopper's selected location.
 * @param {string} checkoutId BigCommerce checkout/cart entity ID.
 * @param {number} locationId BigCommerce inventory location ID selected by the shopper.
 * @returns {Promise<void>} Resolves after the pickup consignment is ready.
 */
export async function preparePickupCheckout(checkoutId: string, locationId: number): Promise<void> {
  const { baseUrl, headers } = getManagementApiConfig();
  const pickupMethodId = await getPickupMethodId(baseUrl, headers, locationId);

  const encodedCheckoutId = encodeURIComponent(checkoutId);
  const checkoutResponse = await managementFetch(`${baseUrl}/v3/checkouts/${encodedCheckoutId}`, {
    headers,
  });
  const checkout = checkoutResponseSchema.parse(await checkoutResponse.json()).data;
  const lineItems = checkout.cart.line_items.physical_items.map(({ id, quantity }) => ({
    item_id: id,
    quantity,
  }));

  if (lineItems.length === 0) return;

  const expectedLineItemIds = lineItems.map(({ item_id }) => item_id).sort();
  const matchingConsignment = checkout.consignments.find((consignment) => {
    const actualLineItemIds = [...(consignment.line_item_ids ?? [])].sort();

    return (
      consignment.pickup_option?.pickup_method_id === pickupMethodId &&
      actualLineItemIds.length === expectedLineItemIds.length &&
      actualLineItemIds.every((id, index) => id === expectedLineItemIds[index])
    );
  });

  if (matchingConsignment && checkout.consignments.length === 1) return;

  await Promise.all(
    checkout.consignments.map((consignment) =>
      managementFetch(
        `${baseUrl}/v3/checkouts/${encodedCheckoutId}/consignments/${encodeURIComponent(consignment.id)}`,
        { method: 'DELETE', headers },
      ),
    ),
  );

  await managementFetch(`${baseUrl}/v3/checkouts/${encodedCheckoutId}/consignments`, {
    method: 'POST',
    headers,
    body: JSON.stringify([
      {
        pickup_option: { pickup_method_id: pickupMethodId },
        line_items: lineItems,
      },
    ]),
  });
}
