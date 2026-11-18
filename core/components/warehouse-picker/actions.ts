'use server';

import { revalidatePath } from 'next/cache';

import { selectWarehouse } from '~/lib/warehouse/server';

export async function changeWarehouse(
  id: string,
  expected: { cartId: string | null; revision: string | null },
): Promise<{ error?: string }> {
  try {
    await selectWarehouse(id, expected);
    revalidatePath('/', 'layout');

    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to change warehouse.' };
  }
}
