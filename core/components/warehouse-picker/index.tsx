import { type PropsWithChildren, type ReactNode } from 'react';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { warehousePreviewEnabled } from '~/lib/warehouse/config';
import { getEnabledWarehouses } from '~/lib/warehouse/locations';
import { getWarehouseContext } from '~/lib/warehouse/server';

import { AvailabilityScope } from './availability-scope';
import { Picker } from './picker';

export async function WarehousePicker({
  children,
  renderHeader,
}: PropsWithChildren<{ renderHeader: (picker: ReactNode) => ReactNode }>) {
  if (!warehousePreviewEnabled())
    return (
      <>
        {renderHeader(null)}
        {children}
      </>
    );

  const warehouses = await getEnabledWarehouses().catch((error: unknown) => {
    if (
      error instanceof WarehouseValidationError &&
      error.code === 'WAREHOUSE_LOCATIONS_UNAVAILABLE'
    )
      return [];
    throw error;
  });

  if (!warehouses.length)
    return (
      <AvailabilityScope value="unavailable">
        {renderHeader(null)}
        <p className="border-b bg-gray-50 px-4 py-3 text-sm" role="status">
          No shopping warehouses are available right now. Please check again later.
        </p>
        {children}
      </AvailabilityScope>
    );

  const { warehouse, recoveryCartVersion, ...context } = await getWarehouseContext();

  return (
    <AvailabilityScope value={`${warehouse?.id ?? 'unselected'}:${context.revision ?? ''}`}>
      {renderHeader(
        <Picker
          context={context}
          key={`${context.cartId ?? ''}:${recoveryCartVersion ?? ''}`}
          selected={warehouse?.id}
          warehouses={warehouses}
        />,
      )}
      {children}
    </AvailabilityScope>
  );
}
