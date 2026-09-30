import { lookup } from 'zipcodes';

import type { ShoppingLocation } from './get-locations';

export const DEFAULT_LOCATION_ID = 1;
export const LOCATION_COOKIE = 'shopping-location';

interface PostalAddress {
  postalCode?: string | null;
  countryCode?: string | null;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

function getZipCoordinates(address: PostalAddress | null | undefined): Coordinates | undefined {
  if (address?.countryCode?.toUpperCase() !== 'US') return undefined;

  const zip = address.postalCode?.trim();

  if (!zip || !/^\d{5}(-\d{4})?$/.test(zip)) return undefined;

  return lookup(zip.slice(0, 5));
}

function validCoordinates(point: ShoppingLocation['coordinates']): point is Coordinates {
  return (
    point != null &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180 &&
    (point.latitude !== 0 || point.longitude !== 0)
  );
}

function distance(from: Coordinates, to: Coordinates): number {
  const radians = Math.PI / 180;
  const deltaLatitude = (to.latitude - from.latitude) * radians;
  const deltaLongitude = (to.longitude - from.longitude) * radians;
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(from.latitude * radians) *
      Math.cos(to.latitude * radians) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function selectShoppingLocation(
  locations: ShoppingLocation[],
  selectedLocationId?: number,
  customerAddress?: PostalAddress | null,
): ShoppingLocation | undefined {
  const selected = locations.find(({ id }) => id === selectedLocationId);

  if (selected) return selected;

  const fallback = locations.find(({ id }) => id === DEFAULT_LOCATION_ID) ?? locations[0];
  const customerCoordinates = getZipCoordinates(customerAddress);

  if (!customerCoordinates) return fallback;

  const ranked = locations.flatMap((location) => {
    const coordinates = validCoordinates(location.coordinates)
      ? location.coordinates
      : getZipCoordinates(location.address);

    return coordinates ? [{ location, distance: distance(customerCoordinates, coordinates) }] : [];
  });

  ranked.sort((a, b) => a.distance - b.distance || a.location.id - b.location.id);

  return ranked[0]?.location ?? fallback;
}
