'use server';

import { revalidatePath } from 'next/cache';

import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { WarehouseError } from '~/lib/warehouse/policy';
import { selectWarehouse } from '~/lib/warehouse/server';

export async function changeWarehouse(
  id: string,
  expected: { cartId: string | null; revision: string | null; operationId: string },
): Promise<{ error?: string; code?: string; retryable?: boolean }> {
  try {
    await selectWarehouse(id, expected);
    revalidatePath('/', 'layout');

    return {};
  } catch (error) {
    if (error instanceof WarehouseValidationError)
      return { error: error.message, code: error.code, retryable: error.status === 503 };
    if (error instanceof WarehouseError)
      return { error: error.message, code: 'INVENTORY_CONFLICT', retryable: false };

    // The write may have committed before the response/revalidation failed.
    return {
      error: 'Unable to confirm your warehouse. Retry the same selection.',
      code: 'UNAVAILABLE',
      retryable: true,
    };
  }
}
