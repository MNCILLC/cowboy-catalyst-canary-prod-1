import { getWarehouses } from '~/lib/warehouse/config';
import { getWarehouseContext } from '~/lib/warehouse/server';

import { Picker } from './picker';

export async function WarehousePicker() {
  const warehouses = getWarehouses();

  if (!warehouses.length) return null;

  const { warehouse, ...context } = await getWarehouseContext();

  return <Picker context={context} selected={warehouse?.id} warehouses={warehouses} />;
}
