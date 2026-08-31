import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { cache } from 'react';
import { z } from 'zod';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { TAGS } from '~/client/tags';

import { OrderGiftCertificateItemFragment, OrderItemFragment } from '../fragment';

const orderPaymentFallbackSchema = z.object({
  payment_method: z.string(),
  total_inc_tax: z.union([z.number(), z.string()]),
  currency_code: z.string(),
});

async function getOrderPaymentFallback(id: number) {
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;

  if (!accessToken || !storeHash) return undefined;

  const response = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${encodeURIComponent(id)}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Auth-Token': accessToken },
    },
  );

  if (!response.ok) return undefined;

  const result = orderPaymentFallbackSchema.safeParse(await response.json());

  if (!result.success || !result.data.payment_method) return undefined;

  return {
    name: result.data.payment_method,
    amount: Number(result.data.total_inc_tax),
    currencyCode: result.data.currency_code,
  };
}

const CustomerOrderDetails = graphql(
  `
    query CustomerOrderDetails($filter: OrderFilterInput) {
      site {
        order(filter: $filter) {
          entityId
          orderedAt {
            utc
          }
          status {
            label
            value
          }
          totalIncTax {
            value
            currencyCode
          }
          subTotal {
            value
            currencyCode
          }
          discounts {
            nonCouponDiscountTotal {
              value
              currencyCode
            }
            couponDiscounts {
              couponCode
              discountedAmount {
                value
                currencyCode
              }
            }
          }
          shippingCostTotal {
            value
            currencyCode
          }
          taxTotal {
            value
            currencyCode
          }
          billingAddress {
            firstName
            lastName
            address1
            city
            stateOrProvince
            postalCode
            country
          }
          payments {
            edges {
              node {
                paymentMethodId
                paymentMethodName
                detail {
                  __typename
                  ... on CreditCardPaymentInstrument {
                    brand
                    last4
                  }
                  ... on GiftCertificatePaymentInstrument {
                    code
                  }
                }
                amount {
                  value
                  currencyCode
                }
              }
            }
          }
          consignments {
            pickups {
              edges {
                node {
                  entityId
                  pickupMethodName
                  collectionInstructions
                  collectionTimeDescription
                  locationName
                  address {
                    address1
                    address2
                    city
                    stateOrProvince
                    postalCode
                    country
                  }
                  lineItems {
                    edges {
                      node {
                        ...OrderItemFragment
                      }
                    }
                  }
                }
              }
            }
            shipping {
              edges {
                node {
                  entityId
                  shippingAddress {
                    firstName
                    lastName
                    address1
                    address2
                    city
                    stateOrProvince
                    postalCode
                    country
                  }
                  shipments {
                    edges {
                      node {
                        entityId
                        shippedAt {
                          utc
                        }
                        shippingMethodName
                        shippingProviderName
                        tracking {
                          __typename
                          ... on OrderShipmentNumberAndUrlTracking {
                            number
                            url
                          }
                          ... on OrderShipmentUrlOnlyTracking {
                            url
                          }
                          ... on OrderShipmentNumberOnlyTracking {
                            number
                          }
                        }
                      }
                    }
                  }
                  lineItems {
                    edges {
                      node {
                        ...OrderItemFragment
                      }
                    }
                  }
                }
              }
            }
            email {
              giftCertificates {
                edges {
                  node {
                    recipientEmail
                    lineItems {
                      edges {
                        node {
                          ...OrderGiftCertificateItemFragment
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  [OrderItemFragment, OrderGiftCertificateItemFragment],
);

export const getCustomerOrderDetails = cache(async (id: number) => {
  const customerAccessToken = await getSessionCustomerAccessToken();

  const response = await client.fetch({
    document: CustomerOrderDetails,
    variables: {
      filter: {
        entityId: id,
      },
    },
    fetchOptions: { cache: 'no-store', next: { tags: [TAGS.customer] } },
    customerAccessToken,
    errorPolicy: 'auth',
  });

  const order = response.data.site.order;

  if (!order) {
    return undefined;
  }

  const fallbackPayment =
    removeEdgesAndNodes(order.payments).length === 0
      ? await getOrderPaymentFallback(order.entityId)
      : undefined;

  return {
    ...order,
    fallbackPayment,
    consignments: {
      pickups:
        order.consignments?.pickups &&
        removeEdgesAndNodes(order.consignments.pickups).map((consignment) => ({
          ...consignment,
          lineItems: removeEdgesAndNodes(consignment.lineItems),
        })),
      shipping:
        order.consignments?.shipping &&
        removeEdgesAndNodes(order.consignments.shipping).map((consignment) => {
          return {
            ...consignment,
            lineItems: removeEdgesAndNodes(consignment.lineItems),
            shipments: removeEdgesAndNodes(consignment.shipments),
          };
        }),
      email:
        order.consignments?.email &&
        removeEdgesAndNodes(order.consignments.email.giftCertificates).map(
          ({ recipientEmail, lineItems }) => {
            return {
              email: recipientEmail,
              lineItems: removeEdgesAndNodes(lineItems).map(({ entityId, name, salePrice }) => ({
                entityId,
                name,
                salePrice,
              })),
            };
          },
        ),
    },
  };
});
