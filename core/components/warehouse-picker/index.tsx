import { type PropsWithChildren } from 'react';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { getWarehouseConfiguration, getWarehouses } from '~/lib/warehouse/config';
import { getWarehouseContext } from '~/lib/warehouse/server';

import { startLocalTestCart } from './actions';
import { AvailabilityScope } from './availability-scope';
import { Picker } from './picker';

export async function WarehousePicker({ children }: PropsWithChildren) {
  const warehouses = getWarehouses();

  if (!warehouses.length) return children;

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
