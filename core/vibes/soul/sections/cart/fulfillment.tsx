'use client';

import { useRef, useState } from 'react';

import { Button } from '@/vibes/soul/primitives/button';
import {
  deliveryServices,
  type ShippingSaveResult,
  type ShippingSelection,
  type ShippingState,
} from '~/lib/freight-cart/policy';

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
      <dt className="sr-only">Shipping</dt>
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
            <fieldset className="space-y-3 pl-7">
              <legend className="mb-3 text-sm font-semibold">Delivery services</legend>
              {deliveryServices.map((service) => (
                <label
                  className="flex cursor-pointer items-center gap-3 text-sm"
                  key={service.code}
                >
                  <input
                    checked={selection.accessorials.includes(service.code)}
                    className="h-4 w-4 accent-current"
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
              ))}
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
