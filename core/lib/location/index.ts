import { getShoppingLocation } from './get-shopping-location';
import { DEFAULT_LOCATION_ID } from './select-location';

export { DEFAULT_LOCATION_ID, LOCATION_COOKIE } from './select-location';

export async function getPreferredLocationId(): Promise<number> {
  return (await getShoppingLocation()).activeLocation?.id ?? DEFAULT_LOCATION_ID;
}
