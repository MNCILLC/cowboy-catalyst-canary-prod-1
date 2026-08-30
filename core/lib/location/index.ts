import { cookies } from 'next/headers';

export const DEFAULT_LOCATION_ID = 1;
export const LOCATION_COOKIE = 'shopping-location';

export async function getPreferredLocationId(): Promise<number> {
  const value = (await cookies()).get(LOCATION_COOKIE)?.value;
  const locationId = Number(value);

  return Number.isInteger(locationId) && locationId > 0 ? locationId : DEFAULT_LOCATION_ID;
}
