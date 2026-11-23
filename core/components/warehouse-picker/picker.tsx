'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Badge } from '@/vibes/soul/primitives/badge';
import { useRouter } from '~/i18n/routing';
import type { WarehouseMapAddress } from '~/lib/warehouse/locations';
import { getShippingOriginWarehouse, Warehouse } from '~/lib/warehouse/policy';

import { changeWarehouse } from './actions';
import { createSelectionAttempt, runSelectionAttempt, SelectionAttempt } from './selection-attempt';

type PickerWarehouse = Warehouse & { name: string; address?: WarehouseMapAddress | null };

function WarehouseLabel({ warehouse }: { warehouse?: PickerWarehouse }) {
  if (!warehouse)
    return <span className="block text-xs font-semibold @md:text-sm">Choose warehouse</span>;

  return (
    <>
      <span className="block whitespace-nowrap text-xs font-semibold leading-tight @md:text-sm">
        {warehouse.allowShipping ? 'Ship or Pickup' : 'Pickup at'}
      </span>
      {!!warehouse.address?.cityState && (
        <span className="block truncate text-xs leading-tight @md:text-sm">
          {warehouse.address.cityState}
        </span>
      )}
    </>
  );
}

function WarehouseOption({ warehouse }: { warehouse: PickerWarehouse }) {
  const { id, name, address } = warehouse;
  const addressLine = address?.formatted || address?.cityState;

  return (
    <Select.Item
      className="flex cursor-pointer select-none items-start gap-3 rounded-lg border border-transparent px-3 py-3 outline-none data-[state=checked]:border-contrast-200 data-[highlighted]:bg-contrast-100 data-[highlighted]:ring-1 data-[highlighted]:ring-inset data-[highlighted]:ring-foreground"
      textValue={name}
      value={id}
    >
      <WarehouseIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <Select.ItemText>
          <span className="block break-words text-sm font-semibold leading-5">{name}</span>
          {Boolean(addressLine) && (
            <span className="mt-0.5 block text-pretty break-words text-sm leading-5 text-contrast-500">
              {addressLine}
            </span>
          )}
          <span className="mt-2 flex flex-wrap gap-1.5 [&>span]:border [&>span]:normal-case">
            {warehouse.allowShipping && (
              <Badge
                className="border-blue-200 [--badge-info-background:theme(colors.blue.100)] [--badge-text:theme(colors.blue.900)]"
                shape="pill"
                variant="info"
              >
                Ship
              </Badge>
            )}
            <Badge
              className="border-emerald-200 [--badge-success-background:theme(colors.emerald.100)] [--badge-text:theme(colors.emerald.900)]"
              shape="pill"
              variant="success"
            >
              {warehouse.allowShipping ? 'Pickup' : 'Pickup only'}
            </Badge>
          </span>
        </Select.ItemText>
      </span>
      <Select.ItemIndicator className="ml-auto mt-0.5 shrink-0">
        <Check aria-hidden="true" className="size-4" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

function WarehouseMapLink({ address }: { address?: WarehouseMapAddress | null }) {
  if (!address?.formatted) return null;

  return (
    <a
      aria-label={`View ${address.formatted} on Google Maps (opens in a new tab)`}
      className="inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 @sm:w-10"
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.formatted)}`}
      rel="noopener noreferrer"
      target="_blank"
      title={address.cityState ? `${address.cityState} Warehouse` : 'Warehouse'}
    >
      <MapPin aria-hidden="true" size={20} strokeWidth={1.75} />
    </a>
  );
}

function WarehouseDropdown({
  current,
  disabled,
  onChange,
  warehouses,
}: {
  current?: PickerWarehouse;
  disabled: boolean;
  onChange: (id: string) => void;
  warehouses: PickerWarehouse[];
}) {
  return (
    <Select.Root disabled={disabled} onValueChange={onChange} value={current?.id ?? ''}>
      <Select.Trigger
        aria-label={current ? `Shopping warehouse, ${current.name}` : 'Shopping warehouse'}
        className="group flex min-h-11 w-32 items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1.5 text-slate-950 transition-colors hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait @xs:w-[9.75rem] @md:w-48 @md:gap-2.5 @md:px-3"
        id="warehouse-choice"
      >
        <WarehouseIcon
          aria-hidden="true"
          className="hidden size-4 shrink-0 @xs:block @md:size-5"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 text-left">
          <WarehouseLabel warehouse={current} />
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180 @md:size-4"
          strokeWidth={1.75}
        />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          align="start"
          aria-label="Shopping warehouse"
          className="z-50 max-h-[var(--radix-select-content-available-height)] w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-contrast-200 bg-background text-foreground shadow-xl"
          collisionPadding={12}
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport className="space-y-1 p-1.5">
            {warehouses.map((warehouse) => (
              <WarehouseOption key={warehouse.id} warehouse={warehouse} />
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function Picker({
  warehouses,
  selected,
  context,
}: {
  warehouses: PickerWarehouse[];
  selected?: string;
  context: { cartId: string | null; revision: string | null };
}) {
  const router = useRouter();
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
        // The action's render can still see the incoming session cookie. Read the new cart.
        if (result.cartSwitched) router.refresh();
      });
    },
    [router, startTransition],
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
      className="relative flex max-w-full shrink-0 items-center gap-1 text-sm @6xl:has-[a]:pl-11"
      data-test="warehouse-picker"
    >
      <WarehouseDropdown
        current={current}
        disabled={pending || !hydrated}
        onChange={(id) => submit(createSelectionAttempt(id, context))}
        warehouses={warehouses}
      />
      <WarehouseMapLink address={selected ? current?.address : undefined} />
      <div
        className={
          checking || hint || retry || error
            ? 'absolute right-0 top-full z-10 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded border bg-white p-3 text-gray-900 shadow-md @xl:left-0 @xl:right-auto'
            : 'absolute'
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
