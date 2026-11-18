'use server';

import { revalidatePath } from 'next/cache';

import { selectWarehouse } from '~/lib/warehouse/server';

export async function changeWarehouse(id: string): Promise<{ error?: string }> {
  try {
    await selectWarehouse(id);
    revalidatePath('/', 'layout');

    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to change warehouse.' };
  }
}
