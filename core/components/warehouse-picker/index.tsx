import { type PropsWithChildren, type ReactNode } from 'react';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { warehousePreviewEnabled } from '~/lib/warehouse/config';
import { getWarehouseLocations } from '~/lib/warehouse/locations';
import { warehouseCartKey } from '~/lib/warehouse/policy';
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

  const locations = await getWarehouseLocations().catch((error: unknown) => {
    if (
      error instanceof WarehouseValidationError &&
      error.code === 'WAREHOUSE_LOCATIONS_UNAVAILABLE'
    )
      return null;
    throw error;
  });

  if (!locations?.warehouses.length)
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
    <AvailabilityScope
      displayedCart={warehouse && warehouseCartKey(context.cartId, warehouse.id)}
      value={`${warehouse?.id ?? 'unselected'}:${context.revision ?? ''}`}
    >
      {renderHeader(
        <Picker
          context={context}
          key={`${context.cartId ?? ''}:${recoveryCartVersion ?? ''}`}
          selected={warehouse?.id}
          warehouses={locations.warehouses.map((option) => {
            const location = locations.publicLocations.get(option.locationId);

            return { ...option, name: location?.name || option.label, address: location?.address };
          })}
        />,
      )}
      {children}
    </AvailabilityScope>
  );
}
