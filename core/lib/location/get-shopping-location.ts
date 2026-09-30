import { cache } from 'react';

import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';

import { getAllLocations } from './get-locations';

import { DEFAULT_LOCATION_ID, getPreferredLocationId } from '.';

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

export const getShoppingLocation = cache(async () => {
  const [locations, preferredLocationId] = await Promise.all([
    getLocations(),
    getPreferredLocationId(),
  ]);
  const activeLocation =
    locations.find(({ id }) => id === preferredLocationId) ??
    locations.find(({ id }) => id === DEFAULT_LOCATION_ID) ??
    locations[0];

  return { locations, activeLocation };
});
