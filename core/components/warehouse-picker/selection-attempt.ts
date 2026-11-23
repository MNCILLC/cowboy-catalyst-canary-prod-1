export interface SelectionAttempt {
  warehouseId: string;
  expected: { cartId: string | null; revision: string | null; operationId: string };
}

export function createSelectionAttempt(
  warehouseId: string,
  context: { cartId: string | null; revision: string | null },
): SelectionAttempt {
  return { warehouseId, expected: { ...context, operationId: crypto.randomUUID() } };
}

// Retry uses the captured attempt, even if new server props arrive while a response is lost.
export async function runSelectionAttempt(
  attempt: SelectionAttempt,
  change: (
    id: string,
    expected: SelectionAttempt['expected'],
  ) => Promise<{ error?: string; retryable?: boolean; cartSwitched?: boolean }>,
) {
  try {
    const result = await change(attempt.warehouseId, attempt.expected);

    return {
      error: result.error ?? '',
      retry: result.retryable ? attempt : undefined,
      cartSwitched: result.cartSwitched,
    };
  } catch {
    return { error: 'Unable to confirm your warehouse. Retry the same selection.', retry: attempt };
  }
}
