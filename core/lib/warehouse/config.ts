import 'server-only';

import { readWarehouseConfiguration } from './configuration';

export function getWarehouseConfiguration() {
  return readWarehouseConfiguration(process.env);
}

// Warehouse routes are also used by carts with an explicit Test-provider policy.
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

export function automaticInitializationEnabled() {
  const mode = process.env.WAREHOUSE_MODE;

  return (
    process.env.WAREHOUSE_ONE_CLICK_ENABLED === 'true' &&
    ((mode === 'development' && process.env.NODE_ENV === 'development') ||
      ((mode === 'staging' || mode === 'multi-location') && process.env.NODE_ENV === 'production'))
  );
}
