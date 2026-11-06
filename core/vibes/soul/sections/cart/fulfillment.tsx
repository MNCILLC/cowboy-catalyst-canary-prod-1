'use client';

import { Info } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/vibes/soul/primitives/button';
import { Tooltip } from '@/vibes/soul/primitives/tooltip';
import {
  deliveryServices,
  type ShippingSaveResult,
  type ShippingSelection,
  type ShippingState,
} from '~/lib/freight-cart/policy';

function DeliveryServiceHelp({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      className="max-w-64 whitespace-normal text-sm"
      open={open}
      setOpen={setOpen}
      trigger={
        <button
          aria-label={`About ${label}`}
          className="shrink-0 rounded p-1 focus-visible:outline focus-visible:outline-2"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Info aria-hidden="true" size={16} />
        </button>
      }
    >
      {description}
    </Tooltip>
  );
}

export interface FulfillmentStatus {
  selected: boolean;
  ready: boolean;
  pending: boolean;
}
export interface FulfillmentProps {
  initial: ShippingState;
  saveAction: (selection: ShippingSelection) => Promise<ShippingSaveResult>;
}

// Saved preferences also carry a server-owned version. Keep that metadata out
// of editable state and the strict selection payload, including after reload.
function editableSelection(value: ShippingSelection): ShippingSelection {
  return {
    fulfillmentMethod: value.fulfillmentMethod,
    accessorials: [...value.accessorials],
  };
}

export function Fulfillment({
  initial,
  saveAction,
  onStatus,
}: FulfillmentProps & { onStatus: (status: FulfillmentStatus) => void }) {
  const [selection, setSelection] = useState<ShippingSelection | null>(() =>
    initial.preferences ? editableSelection(initial.preferences) : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    initial.error ??
      (initial.preferences && !initial.confirmed
        ? 'Confirm your shipping selection to continue.'
        : undefined),
  );
  const saving = useRef(false);

  async function save(next: ShippingSelection) {
    if (saving.current) return;
    saving.current = true;

    const editable = editableSelection(next);

    setSelection(editable);
    setPending(true);
    setError(undefined);
    onStatus({ selected: true, ready: false, pending: true });

    try {
      const result = await saveAction(editable);

      if ('error' in result) throw new Error(result.error);
      setSelection(editableSelection(result.preferences));
      onStatus({ selected: true, ready: true, pending: false });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save shipping preferences. Please retry.',
      );
      onStatus({ selected: true, ready: false, pending: false });
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <div className="py-4">
      <dt className="mb-2">Shipping</dt>
      <dd>
        <fieldset aria-describedby="fulfillment-status" className="space-y-4" disabled={pending}>
          <legend className="sr-only">Fulfillment method</legend>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              checked={selection?.fulfillmentMethod === 'pickup'}
              className="h-4 w-4 accent-current"
              name="fulfillment-method"
              onChange={() => save({ fulfillmentMethod: 'pickup', accessorials: [] })}
              type="radio"
              value="pickup"
            />
            <span className="flex-1">Pickup at Warehouse</span>
            {selection?.fulfillmentMethod === 'pickup' && <span>$0.00</span>}
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              checked={selection?.fulfillmentMethod === 'ship'}
              className="h-4 w-4 accent-current"
              name="fulfillment-method"
              onChange={() => save({ fulfillmentMethod: 'ship', accessorials: [] })}
              type="radio"
              value="ship"
            />
            <span className="flex-1">Ship</span>
            {selection?.fulfillmentMethod === 'ship' && (
              <span className="text-sm">calculated in checkout</span>
            )}
          </label>
          {selection?.fulfillmentMethod === 'ship' && (
            <fieldset className="min-w-0 pl-7 @container">
              <legend className="mb-3 text-sm font-semibold">Delivery services</legend>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 @[24rem]:grid-cols-2">
                {deliveryServices.map((service) => (
                  <div className="flex items-center gap-1" key={service.code}>
                    <label className="flex cursor-pointer items-center gap-3 whitespace-nowrap text-xs">
                      <input
                        checked={selection.accessorials.includes(service.code)}
                        className="h-4 w-4 shrink-0 accent-current"
                        onChange={(event) =>
                          save({
                            ...selection,
                            accessorials: event.target.checked
                              ? [...selection.accessorials, service.code]
                              : selection.accessorials.filter((code) => code !== service.code),
                          })
                        }
                        type="checkbox"
                      />
                      {service.label}
                    </label>
                    <DeliveryServiceHelp description={service.description} label={service.label} />
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </fieldset>
        <div aria-live="polite" className="mt-2 text-sm" id="fulfillment-status">
          {pending && <p>Saving shipping preferences…</p>}
          {error !== undefined && <p role="alert">{error}</p>}
        </div>
        {error !== undefined && selection !== null && !pending && (
          <Button
            className="mt-2"
            onClick={() => save(selection)}
            size="small"
            type="button"
            variant="secondary"
          >
            Retry
          </Button>
        )}
      </dd>
    </div>
  );
}
