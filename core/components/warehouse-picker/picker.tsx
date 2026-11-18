'use client';

import { useEffect, useState, useTransition } from 'react';

import { Warehouse } from '~/lib/warehouse/policy';

import { changeWarehouse } from './actions';
import { createSelectionAttempt, runSelectionAttempt, SelectionAttempt } from './selection-attempt';

export function Picker({
  warehouses,
  selected,
  context,
}: {
  warehouses: Warehouse[];
  selected?: string;
  context: { cartId: string | null; revision: string | null };
}) {
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<SelectionAttempt>();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  const [pending, startTransition] = useTransition();
  const submit = (attempt: SelectionAttempt) => {
    setError('');
    setRetry(undefined);
    startTransition(async () => {
      const result = await runSelectionAttempt(attempt, changeWarehouse);

      setError(result.error);
      setRetry(result.retry);
    });
  };
  const hint = selected
    ? 'Availability is checked for this warehouse when you add items.'
    : 'Choose a warehouse before adding items. You can browse first.';

  return (
    <section
      aria-label="Shopping warehouse"
      className="border-b bg-gray-50 px-4 py-3 text-sm"
      data-test="warehouse-picker"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3">
        <label className="font-semibold" htmlFor="warehouse-choice">
          Shopping warehouse
        </label>
        <select
          className="max-w-full rounded border bg-white px-3 py-2"
          disabled={pending || !hydrated}
          id="warehouse-choice"
          onChange={(event) => submit(createSelectionAttempt(event.target.value, context))}
          value={selected ?? ''}
        >
          <option disabled value="">
            Choose your warehouse
          </option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <span aria-live="polite">{pending ? 'Checking cart availability…' : hint}</span>
      </div>
      {retry && (
        <button
          className="mt-2 rounded border px-3 py-2"
          disabled={pending}
          onClick={() => submit(retry)}
          type="button"
        >
          Retry warehouse selection
        </button>
      )}
      {Boolean(error) && (
        <p className="mx-auto mt-2 max-w-screen-2xl text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
