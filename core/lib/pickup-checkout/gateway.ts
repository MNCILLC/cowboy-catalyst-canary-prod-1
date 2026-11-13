import 'server-only';

import { z } from 'zod';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { getCartId } from '~/lib/cart';

import type { PickupGateway, PickupSnapshot } from './engine';
import { markerSchema, normalizeAddress, type PickupAddress, PickupCheckoutError } from './policy';

const Query = graphql(`
  query PickupCheckoutQuery($cartId: String!) {
    customer {
      entityId
      email
    }
    site {
      cart(entityId: $cartId) {
        entityId
        version
        lineItems {
          physicalItems {
            entityId
            quantity
          }
        }
        metafields(
          namespace: "bc_storefront"
          keys: ["pickup_checkout", "freight_fulfillment"]
          first: 2
        ) {
          edges {
            node {
              entityId
              key
              value
            }
          }
        }
      }
      checkout(entityId: $cartId) {
        entityId
        version
        billingAddress {
          entityId
          firstName
          lastName
          email
          company
          phone
          address1
          address2
          city
          stateOrProvince
          stateOrProvinceCode
          postalCode
          countryCode
          customFields {
            entityId
          }
        }
        shippingConsignments {
          entityId
          lineItemIds
          address {
            firstName
            lastName
            email
            company
            phone
            address1
            address2
            city
            stateOrProvince
            stateOrProvinceCode
            postalCode
            countryCode
            customFields {
              entityId
            }
          }
          availableShippingOptions {
            entityId
            description
            type
            cost {
              value
            }
          }
          selectedShippingOption {
            entityId
            description
            type
            cost {
              value
            }
          }
        }
      }
    }
  }
`);
const CreateMarker = graphql(`
  mutation CreatePickupMarker($input: CreateCartMetafieldInput!) {
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
const UpdateMarker = graphql(`
  mutation UpdatePickupMarker($input: UpdateCartMetafieldInput!) {
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
const DeleteMarker = graphql(`
  mutation DeletePickupMarker($input: DeleteCartMetafieldInput!) {
    cart {
      deleteCartMetafield(input: $input) {
        errors {
          __typename
        }
      }
    }
  }
`);
const Assign = graphql(`
  mutation AssignPickupCart($input: AssignCartToCustomerInput!) {
    cart {
      assignCartToCustomer(input: $input) {
        cart {
          entityId
        }
      }
    }
  }
`);
const AddBilling = graphql(`
  mutation AddPickupBilling($input: AddCheckoutBillingAddressInput!) {
    checkout {
      addCheckoutBillingAddress(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);
const UpdateBilling = graphql(`
  mutation UpdatePickupBilling($input: UpdateCheckoutBillingAddressInput!) {
    checkout {
      updateCheckoutBillingAddress(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);
const AddShipping = graphql(`
  mutation AddPickupShipping($input: AddCheckoutShippingConsignmentsInput!) {
    checkout {
      addCheckoutShippingConsignments(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);
const UpdateShipping = graphql(`
  mutation UpdatePickupShipping($input: UpdateCheckoutShippingConsignmentInput!) {
    checkout {
      updateCheckoutShippingConsignment(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);
const Select = graphql(`
  mutation SelectPickupShipping($input: SelectCheckoutShippingOptionInput!) {
    checkout {
      selectCheckoutShippingOption(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);
const Delete = graphql(`
  mutation DeletePickupShipping($input: DeleteCheckoutConsignmentInput!) {
    checkout {
      deleteCheckoutConsignment(input: $input) {
        checkout {
          entityId
        }
      }
    }
  }
`);

function requireResult(result: unknown) {
  if (!result)
    throw new PickupCheckoutError('Checkout could not be updated. Return to the cart and retry.');
}

export async function pickupGateway(cartId: string): Promise<PickupGateway> {
  const customerAccessToken = await getSessionCustomerAccessToken();

  if (!customerAccessToken || cartId !== (await getCartId()))
    throw new PickupCheckoutError(
      'Your cart or account changed. Reload the cart and sign in again.',
    );

  const options = { customerAccessToken, fetchOptions: { cache: 'no-store' as const } };

  async function raw() {
    if (cartId !== (await getCartId()))
      throw new PickupCheckoutError('Your cart changed. Reload the cart.');

    const { data } = await client.fetch({ document: Query, variables: { cartId }, ...options });

    if (!data.customer || data.site.cart?.entityId !== cartId || !data.site.checkout)
      throw new PickupCheckoutError('Your cart or account changed. Reload the cart.');

    return { customer: data.customer, cart: data.site.cart, checkout: data.site.checkout };
  }

  async function read(): Promise<PickupSnapshot> {
    const { cart, checkout, customer } = await raw();
    const fields = cart.metafields.edges?.map((e) => e.node) ?? [];
    const markerValue = fields.find((f) => f.key === 'pickup_checkout')?.value;
    let marker = null;

    if (markerValue) {
      try {
        marker = markerSchema.parse(JSON.parse(markerValue));
      } catch {
        throw new PickupCheckoutError(
          'Pickup recovery details are invalid. Please contact the store.',
        );
      }
    }

    const preferenceValue = fields.find((f) => f.key === 'freight_fulfillment')?.value;
    const preference = z
      .object({
        fulfillmentMethod: z.enum(['pickup', 'ship']).optional(),
        version: z.number().int().positive().optional(),
      })
      .parse(preferenceValue ? JSON.parse(preferenceValue) : {});

    if (!cart.version || !checkout.version)
      throw new PickupCheckoutError('Checkout version is unavailable. Please retry.');

    // Never discard custom address fields while snapshotting/restoring checkout data.
    if (
      checkout.billingAddress?.customFields.length ||
      checkout.shippingConsignments?.some((c) => c.address.customFields.length)
    ) {
      throw new PickupCheckoutError(
        'This checkout has custom address fields. Please contact the store to arrange pickup.',
      );
    }

    return {
      cartVersion: cart.version,
      checkoutVersion: checkout.version,
      customerId: customer.entityId,
      method: preference.fulfillmentMethod ?? null,
      preferenceVersion: preference.version ?? null,
      marker,
      billing: checkout.billingAddress ? normalizeAddress(checkout.billingAddress) : null,
      billingId: checkout.billingAddress?.entityId ?? null,
      items: cart.lineItems.physicalItems.map((i) => ({
        lineItemEntityId: i.entityId,
        quantity: i.quantity,
      })),
      shipping: (checkout.shippingConsignments ?? []).map((c) => ({
        id: c.entityId,
        address: normalizeAddress(c.address),
        lineItemIds: c.lineItemIds,
        options: c.availableShippingOptions ?? [],
        selected: c.selectedShippingOption ?? null,
      })),
    };
  }

  const withAddress = (address: PickupAddress) => ({ ...address, shouldSaveAddress: false });

  return {
    read,
    async mark(marker) {
      const { cart } = await raw();
      const field = cart.metafields.edges?.find((e) => e.node.key === 'pickup_checkout')?.node;

      if (!marker) {
        if (!field) return;

        const { data } = await client.fetch({
          document: DeleteMarker,
          variables: { input: { cartEntityId: cartId, metafieldEntityId: field.entityId } },
          ...options,
        });

        if (data.cart.deleteCartMetafield.errors.length)
          throw new PickupCheckoutError(
            'Pickup recovery details could not be cleared. Please retry.',
          );

        return;
      }

      const value = JSON.stringify(markerSchema.parse(marker));
      const payload = { key: 'pickup_checkout', value };
      const result = field
        ? (
            await client.fetch({
              document: UpdateMarker,
              variables: {
                input: { cartEntityId: cartId, metafieldEntityId: field.entityId, data: payload },
              },
              ...options,
            })
          ).data.cart.updateCartMetafield
        : (
            await client.fetch({
              document: CreateMarker,
              variables: { input: { cartEntityId: cartId, data: payload } },
              ...options,
            })
          ).data.cart.createCartMetafield;

      if (result.errors.length || result.metafield?.value !== value)
        throw new PickupCheckoutError('Pickup recovery details could not be saved. Please retry.');
    },
    async assign(version) {
      const { data } = await client.fetch({
        document: Assign,
        variables: { input: { cartEntityId: cartId, version } },
        ...options,
      });

      requireResult(data.cart.assignCartToCustomer?.cart?.entityId === cartId);
    },
    async bill(address, s) {
      const data = { address: withAddress(address) };
      const result = s.billingId
        ? (
            await client.fetch({
              document: UpdateBilling,
              variables: {
                input: {
                  checkoutEntityId: cartId,
                  addressEntityId: s.billingId,
                  version: s.checkoutVersion,
                  data,
                },
              },
              ...options,
            })
          ).data.checkout.updateCheckoutBillingAddress
        : (
            await client.fetch({
              document: AddBilling,
              variables: { input: { checkoutEntityId: cartId, version: s.checkoutVersion, data } },
              ...options,
            })
          ).data.checkout.addCheckoutBillingAddress;

      requireResult(result?.checkout);
    },
    async ship(address, s) {
      const consignment = { address: withAddress(address), lineItems: s.items };
      const id = s.shipping[0]?.id;
      const result = id
        ? (
            await client.fetch({
              document: UpdateShipping,
              variables: {
                input: {
                  checkoutEntityId: cartId,
                  consignmentEntityId: id,
                  version: s.checkoutVersion,
                  data: { consignment },
                },
              },
              ...options,
            })
          ).data.checkout.updateCheckoutShippingConsignment
        : (
            await client.fetch({
              document: AddShipping,
              variables: {
                input: {
                  checkoutEntityId: cartId,
                  version: s.checkoutVersion,
                  data: { consignments: [consignment] },
                },
              },
              ...options,
            })
          ).data.checkout.addCheckoutShippingConsignments;

      requireResult(result?.checkout);
    },
    async select(id, optionId, version) {
      const { data } = await client.fetch({
        document: Select,
        variables: {
          input: {
            checkoutEntityId: cartId,
            consignmentEntityId: id,
            version,
            data: { shippingOptionEntityId: optionId },
          },
        },
        ...options,
      });

      requireResult(data.checkout.selectCheckoutShippingOption?.checkout);
    },
    async remove(id, version) {
      const { data } = await client.fetch({
        document: Delete,
        variables: { input: { checkoutEntityId: cartId, consignmentEntityId: id, version } },
        ...options,
      });

      requireResult(data.checkout.deleteCheckoutConsignment?.checkout);
    },
  };
}
