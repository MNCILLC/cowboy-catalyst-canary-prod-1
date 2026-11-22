'use client';

import { ChevronDown, Warehouse as WarehouseIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { getShippingOriginWarehouse, Warehouse } from '~/lib/warehouse/policy';

import { changeWarehouse } from './actions';
import { createSelectionAttempt, runSelectionAttempt, SelectionAttempt } from './selection-attempt';

function WarehouseLabel({ warehouse }: { warehouse?: Warehouse }) {
  if (!warehouse)
    return <span className="block text-xs font-semibold @md:text-sm">Choose warehouse</span>;

  return (
    <>
      <span className="block whitespace-nowrap text-xs font-semibold leading-tight @md:text-sm">
        {warehouse.allowShipping ? 'Ship or pick up' : 'Pick up at'}
      </span>
      <span className="block truncate text-xs leading-tight @md:text-sm">
        {warehouse.pickupLabel.replace(/^pick\s?up (?:at|in) /i, '')}
      </span>
    </>
  );
}

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
  const lastRecoveryOrigin = useRef<string>(undefined);

  useEffect(() => setHydrated(true), []);

  const [pending, startTransition] = useTransition();
  const submit = useCallback(
    (attempt: SelectionAttempt) => {
      setError('');
      setRetry(undefined);
      startTransition(async () => {
        const result = await runSelectionAttempt(attempt, changeWarehouse);

        setError(result.error);
        setRetry(result.retry);
      });
    },
    [startTransition],
  );
  const { cartId, revision } = context;
  const needsRecovery = Boolean(cartId && !revision && !selected);
  const originId = needsRecovery ? getShippingOriginWarehouse(warehouses)?.id : undefined;

  useEffect(() => {
    // The parent keys the picker by cart and recovery version. Rerenders (including
    // Strict Mode's repeated effect) must not submit the same automatic check again.
    if (lastRecoveryOrigin.current === originId) return;
    lastRecoveryOrigin.current = originId;
    if (cartId && originId) submit(createSelectionAttempt(originId, { cartId, revision: null }));
  }, [cartId, originId, submit]);

  const checking = pending || Boolean(originId && !error);
  const choice = selected ?? (error ? undefined : originId);
  const current = warehouses.find((warehouse) => warehouse.id === choice);

  let hint = selected ? null : 'Choose a warehouse before adding items. You can browse first.';

  if (needsRecovery) hint = 'Choose a warehouse to check availability for the items in your cart.';

  return (
    <section
      aria-label="Shopping warehouse"
      className="relative w-[9.75rem] max-w-full shrink-0 text-sm @md:w-48"
      data-test="warehouse-picker"
    >
      <div className="relative">
        <select
          aria-label="Shopping warehouse"
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
          disabled={pending || !hydrated}
          id="warehouse-choice"
          onChange={(event) => submit(createSelectionAttempt(event.target.value, context))}
          value={choice ?? ''}
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
        <div
          aria-hidden="true"
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1.5 text-slate-950 transition-colors peer-hover:bg-slate-200 peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-focus-visible:ring-offset-2 @md:gap-2.5 @md:px-3"
        >
          <WarehouseIcon className="size-4 shrink-0 @md:size-5" strokeWidth={1.75} />
          <div className="min-w-0 flex-1 text-left">
            <WarehouseLabel warehouse={current} />
          </div>
          <ChevronDown className="size-3.5 shrink-0 @md:size-4" strokeWidth={1.75} />
        </div>
      </div>
      <div
        className={
          checking || hint || retry || error
            ? 'absolute right-0 top-full z-10 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded border bg-white p-3 text-gray-900 shadow-md @xl:left-0 @xl:right-auto'
            : undefined
        }
      >
        <span aria-live="polite">{checking ? 'Checking cart availability…' : hint}</span>
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
          <p className="mt-2 text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
