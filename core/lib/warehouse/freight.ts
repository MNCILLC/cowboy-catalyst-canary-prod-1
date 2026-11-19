import 'server-only';

import {
  deliveryServices,
  type ShippingPreferences,
  type ShippingSelection,
  shippingSelectionSchema,
} from '~/lib/freight-cart/policy';
import { FreightPreferenceConflict, requestCartPreferences } from '~/lib/freight-cart/transport';

import { WarehouseValidationError } from './authorization';
import { validateWarehouseCheckout } from './validation';

export interface FreightUpdate {
  selection: ShippingSelection;
  expectedVersion: number;
}

const matches = (current: ShippingPreferences, selection: ShippingSelection) =>
  current.fulfillmentMethod === selection.fulfillmentMethod &&
  JSON.stringify([...current.accessorials].sort()) ===
    JSON.stringify([...selection.accessorials].sort());

export async function warehouseFreight(
  token: string,
  origin: string,
  cartId: string,
  revision: string,
  update?: FreightUpdate,
) {
  if (process.env.WAREHOUSE_FREIGHT_ENABLED !== 'true')
    throw new WarehouseValidationError(
      'Checkout delivery preferences are unavailable.',
      503,
      'UNAVAILABLE',
    );

  let mode: 'shipping' | 'pickup' | undefined;

  if (update) mode = update.selection.fulfillmentMethod === 'ship' ? 'shipping' : 'pickup';

  await validateWarehouseCheckout(token, origin, cartId, revision, mode);

  const connection = {
    url: process.env.FREIGHT_APP_URL ?? '',
    storeHash: process.env.BIGCOMMERCE_STORE_HASH ?? '',
    token: process.env.FREIGHT_APP_CHECKOUT_TOKEN ?? '',
  };
  let preferences = await requestCartPreferences(connection, cartId);

  if (update) {
    const parsed = shippingSelectionSchema.parse(update.selection);
    const selection = {
      ...parsed,
      accessorials: parsed.fulfillmentMethod === 'pickup' ? [] : [...new Set(parsed.accessorials)],
    };
    // A lost response can be retried only for the same immediately succeeding value.
    const replay =
      preferences &&
      preferences.version === update.expectedVersion + 1 &&
      matches(preferences, selection);

    if (!replay) {
      if ((preferences?.version ?? 0) !== update.expectedVersion)
        throw new FreightPreferenceConflict(
          'Delivery preferences changed. Reload preferences and review them.',
        );
      preferences = await requestCartPreferences(connection, cartId, {
        ...selection,
        expectedVersion: update.expectedVersion,
      });
    }

    if (!preferences || !matches(preferences, selection))
      throw new Error('Preference write was not confirmed');

    const confirmed = await requestCartPreferences(connection, cartId);

    if (!confirmed || confirmed.version !== preferences.version || !matches(confirmed, selection))
      throw new FreightPreferenceConflict(
        'Delivery preferences changed. Reload preferences and review them.',
      );
  }

  // Detect a warehouse switch during the remote request; never report it as approved.
  await validateWarehouseCheckout(token, origin, cartId, revision, mode);

  return { version: 1, cartId, revision, preferences, services: deliveryServices };
}
