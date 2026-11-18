import 'server-only';

import { readWarehouseConfiguration } from './configuration';

export function getWarehouseConfiguration() {
  return readWarehouseConfiguration(process.env);
}

// Both modes remain non-purchasable and use the isolated checkout handoff.
export function warehousePreviewEnabled() {
  return getWarehouseConfiguration().mode !== 'off';
}

export function getWarehouses() {
  return getWarehouseConfiguration().warehouses;
}

export function warehouseCheckoutOriginAllowed(origin: string) {
  const config = getWarehouseConfiguration();

  return config.mode !== 'staging' || config.checkoutOrigins.includes(origin);
}
