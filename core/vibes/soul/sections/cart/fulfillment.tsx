'use client';

import { Info, MapPin, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/vibes/soul/primitives/badge';
import { Button } from '@/vibes/soul/primitives/button';
import { Tooltip } from '@/vibes/soul/primitives/tooltip';
import {
  deliveryServices,
  type ShippingSaveResult,
  type ShippingSelection,
  type ShippingState,
} from '~/lib/freight-cart/policy';

import { PickupBilling, type PickupBillingProps } from './pickup-billing';

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
  pickup?: PickupBillingProps;
  shippingOrigin?: { city: string; state: string; address: string } | null;
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
  pickup,
  saveAction,
  shippingOrigin,
  onStatus,
}: FulfillmentProps & { onStatus: (status: FulfillmentStatus) => void }) {
  const [selection, setSelection] = useState<ShippingSelection | null>(() =>
    initial.preferences ? editableSelection(initial.preferences) : null,
  );
  const [confirmed, setConfirmed] = useState(initial.confirmed);
  const [version, setVersion] = useState(initial.preferences?.version ?? null);
  const [billingReady, setBillingReady] = useState(pickup?.initial.ready ?? true);
  const [billingPending, setBillingPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    initial.error ??
      (initial.preferences && !initial.confirmed
        ? 'Confirm your shipping selection to continue.'
        : undefined),
  );
  const saving = useRef(false);
  const onBillingStatus = useCallback((ready: boolean, busy: boolean) => {
    setBillingReady(ready);
    setBillingPending(busy);
  }, []);

  useEffect(() => {
    onStatus({
      selected: selection !== null,
      ready:
        confirmed &&
        !pending &&
        !billingPending &&
        (selection?.fulfillmentMethod !== 'pickup' || !pickup || billingReady),
      pending: pending || billingPending,
    });
  }, [selection, confirmed, pending, billingPending, billingReady, pickup, onStatus]);

  async function save(next: ShippingSelection) {
    if (saving.current) return;
    saving.current = true;

    const editable = editableSelection(next);

    setSelection(editable);
    setPending(true);
    setConfirmed(false);
    setError(undefined);
    onStatus({ selected: true, ready: false, pending: true });

    try {
      const result = await saveAction(editable);

      if ('error' in result) throw new Error(result.error);
      setSelection(editableSelection(result.preferences));
      setVersion(result.preferences.version);
      setConfirmed(true);
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
      <dt className="mb-2 flex items-center gap-2">
        <span>Shipping</span>
        {selection === null && (
          <Badge
            className="inline-flex items-center gap-1.5 !normal-case"
            shape="pill"
            variant="warning"
          >
            <TriangleAlert aria-hidden="true" className="shrink-0" size={14} />
            <span>Select Pickup or Ship to continue</span>
          </Badge>
        )}
      </dt>
      <dd>
        <fieldset
          aria-describedby="fulfillment-status"
          className="space-y-4"
          disabled={pending || billingPending}
        >
          <legend className="sr-only">Fulfillment method</legend>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                checked={selection?.fulfillmentMethod === 'pickup'}
                className="h-4 w-4 shrink-0 accent-current"
                name="fulfillment-method"
                onChange={() => save({ fulfillmentMethod: 'pickup', accessorials: [] })}
                type="radio"
                value="pickup"
              />
              <span>Pickup at Warehouse</span>
            </label>
            {shippingOrigin && (
              <a
                aria-label={`View warehouse in ${[shippingOrigin.city, shippingOrigin.state].filter(Boolean).join(', ')} on Google Maps (opens in a new window)`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-contrast-100 px-2 py-1 text-xs hover:bg-contrast-200 focus-visible:outline focus-visible:outline-2"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shippingOrigin.address)}`}
                rel="noopener noreferrer"
                target="_blank"
                title={shippingOrigin.address}
              >
                <MapPin aria-hidden="true" className="shrink-0" size={16} />
                <span>
                  {[shippingOrigin.city, shippingOrigin.state].filter(Boolean).join(', ')}
                </span>
              </a>
            )}
            {selection?.fulfillmentMethod === 'pickup' && <span className="ml-auto">$0.00</span>}
          </div>
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
              <legend className="mb-3 w-full text-sm font-semibold">
                <span className="flex flex-wrap items-center gap-2">
                  <span>Delivery services</span>
                  <Badge
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap !normal-case"
                    shape="pill"
                    variant="warning"
                  >
                    <TriangleAlert aria-hidden="true" className="shrink-0" size={14} />
                    <span>Select services to ensure proper delivery</span>
                  </Badge>
                </span>
              </legend>
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
        {pickup && selection?.fulfillmentMethod === 'pickup' && (
          <PickupBilling
            {...pickup}
            disabled={pending || !confirmed}
            onStatus={onBillingStatus}
            version={version}
          />
        )}
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
