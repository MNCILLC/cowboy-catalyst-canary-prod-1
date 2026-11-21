import { type PropsWithChildren } from 'react';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { getWarehouseConfiguration, warehousePreviewEnabled } from '~/lib/warehouse/config';
import { getEnabledWarehouses } from '~/lib/warehouse/locations';
import { getWarehouseContext } from '~/lib/warehouse/server';

import { startLocalTestCart } from './actions';
import { AvailabilityScope } from './availability-scope';
import { Picker } from './picker';

export async function WarehousePicker({ children }: PropsWithChildren) {
  if (!warehousePreviewEnabled()) return children;

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
        <p className="border-b bg-gray-50 px-4 py-3 text-sm" role="status">
          No shopping warehouses are available right now. Please check again later.
        </p>
        {children}
      </AvailabilityScope>
    );

  try {
    const { warehouse, ...context } = await getWarehouseContext();

    return (
      <AvailabilityScope value={`${warehouse?.id ?? 'unselected'}:${context.revision ?? ''}`}>
        <Picker context={context} selected={warehouse?.id} warehouses={warehouses} />
        {children}
      </AvailabilityScope>
    );
  } catch (error) {
    if (
      getWarehouseConfiguration().mode !== 'development' ||
      !(error instanceof WarehouseValidationError) ||
      error.code !== 'WAREHOUSE_RECOVERY_REQUIRED'
    )
      throw error;

    return (
      <AvailabilityScope value="recovery">
        <section className="border-b bg-gray-50 px-4 py-3 text-sm">
          <p>
            This cart predates local warehouse development. Start a new test cart to continue. The
            existing cart is kept in the sandbox.
          </p>
          <form action={startLocalTestCart}>
            <button className="underline" type="submit">
              Start new local test cart
            </button>
          </form>
        </section>
        {children}
      </AvailabilityScope>
    );
  }
}
