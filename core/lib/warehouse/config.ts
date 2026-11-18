import 'server-only';

import { readWarehouseConfiguration } from './configuration';

export function getWarehouseConfiguration() {
  return readWarehouseConfiguration(process.env);
}

// Warehouse development and rehearsals remain non-purchasable.
export function warehousePreviewEnabled() {
  return getWarehouseConfiguration().mode !== 'off';
}

export function getWarehouses() {
  return getWarehouseConfiguration().warehouses;
}

export function warehouseCheckoutOriginAllowed(origin: string) {
  const config = getWarehouseConfiguration();

  return (
    config.mode === 'off' || config.mode === 'preview' || config.checkoutOrigins.includes(origin)
  );
}
