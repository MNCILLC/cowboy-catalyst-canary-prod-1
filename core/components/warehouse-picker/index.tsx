import { getWarehouses } from '~/lib/warehouse/config';
import { getWarehouseSelection } from '~/lib/warehouse/server';

import { Picker } from './picker';

export async function WarehousePicker() {
  const warehouses = getWarehouses();

  if (!warehouses.length) return null;

  return <Picker selected={(await getWarehouseSelection())?.id} warehouses={warehouses} />;
}
