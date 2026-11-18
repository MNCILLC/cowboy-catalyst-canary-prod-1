'use server';

import { revalidatePath } from 'next/cache';

import { clearCartId } from '~/lib/cart';
import { WarehouseValidationError } from '~/lib/warehouse/authorization';
import { getWarehouseConfiguration } from '~/lib/warehouse/config';
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

// Development-only recovery detaches the old cart; it never deletes it in BigCommerce.
export async function startLocalTestCart(): Promise<void> {
  if (getWarehouseConfiguration().mode !== 'development')
    throw new Error('Local development only.');
  await clearCartId();
  revalidatePath('/', 'layout');
}
