'use server';

import { client } from '~/client';
import { graphql } from '~/client/graphql';

import { formatOriginAddress } from './address';

// BigCommerce reserves location 1 for the store's default shipping origin.
const ShippingOriginQuery = graphql(`
  query MapSectionShippingOriginQuery {
    inventory {
      locations(entityIds: [1], first: 1) {
        edges {
          node {
            address {
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
    }
  }
`);

export async function loadMapShippingOrigin() {
  const { data } = await client.fetch({
    document: ShippingOriginQuery,
    fetchOptions: { next: { revalidate: 60 } },
  });

  return formatOriginAddress(data.inventory.locations.edges?.[0]?.node.address);
}
