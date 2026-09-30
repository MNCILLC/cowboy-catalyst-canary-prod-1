import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';

import { getAllLocations } from './get-locations';
import { LOCATION_COOKIE, selectShoppingLocation } from './select-location';

const GetLocationsQuery = graphql(`
  query GetLocationsQuery {
    inventory {
      locations(first: 50) {
        edges {
          node {
            entityId
            label
            address {
              address1
              address2
              city
              stateOrProvince
              postalCode
              countryCode
              latitude
              longitude
            }
          }
        }
      }
    }
  }
`);

const getStorefrontLocations = cache(async () => {
  const { data } = await client.fetch({
    document: GetLocationsQuery,
    fetchOptions: { next: { revalidate } },
  });

  return (data.inventory.locations.edges ?? []).map(({ node }) => ({
    id: node.entityId,
    label: node.label,
    address: node.address,
    coordinates:
      node.address?.latitude != null && node.address.longitude != null
        ? { latitude: node.address.latitude, longitude: node.address.longitude }
        : undefined,
  }));
});

const getLocations = cache(async () => {
  try {
    const locations = await getAllLocations();

    if (locations.length > 0) return locations;
  } catch (error) {
    // Keep location selection usable when the management token does not have the Locations read scope.
    // eslint-disable-next-line no-console
    console.error('Unable to load all BigCommerce locations', error);
  }

  return getStorefrontLocations();
});

const CustomerLocationQuery = graphql(`
  query CustomerLocationQuery {
    customer {
      addresses(first: 1) {
        edges {
          node {
            postalCode
            countryCode
          }
        }
      }
    }
  }
`);

async function getCustomerLocationAddress() {
  const customerAccessToken = await getSessionCustomerAccessToken();

  if (!customerAccessToken) return undefined;

  try {
    const { data } = await client.fetch({
      document: CustomerLocationQuery,
      customerAccessToken,
      fetchOptions: { cache: 'no-store' },
    });

    return data.customer?.addresses.edges?.[0]?.node;
  } catch (error) {
    unstable_rethrow(error);
    // Do not log customer data or prevent shopping if address lookup is unavailable.
    // eslint-disable-next-line no-console
    console.error('Unable to load the customer ZIP code for the default shopping location.');

    return undefined;
  }
}

// React cache deduplicates within one request only; customer defaults are never shared across users.
export const getShoppingLocation = cache(async () => {
  const [locations, cookieJar] = await Promise.all([getLocations(), cookies()]);
  const selectedLocationId = Number(cookieJar.get(LOCATION_COOKIE)?.value);
  const hasSelection = locations.some(({ id }) => id === selectedLocationId);
  const customerAddress = hasSelection ? undefined : await getCustomerLocationAddress();
  const activeLocation = selectShoppingLocation(locations, selectedLocationId, customerAddress);

  return { locations, activeLocation };
});
