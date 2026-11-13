'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/vibes/soul/primitives/button';
import {
  normalizeAddress,
  type PickupAddress,
  type PickupBillingResult,
  type PickupBillingState,
} from '~/lib/pickup-checkout/policy';

export interface PickupBillingProps {
  initial: PickupBillingState;
  saveAction: (address: PickupAddress, version: number) => Promise<PickupBillingResult>;
}

const fields = [
  ['firstName', 'First name', 'given-name', true],
  ['lastName', 'Last name', 'family-name', true],
  ['company', 'Company (optional)', 'organization', false],
  ['address1', 'Street address', 'address-line1', true],
  ['address2', 'Apartment, suite, etc. (optional)', 'address-line2', false],
  ['city', 'City', 'address-level2', true],
  ['stateOrProvince', 'State / province', 'address-level1', false],
  ['postalCode', 'Postal code', 'postal-code', false],
  ['phone', 'Phone', 'tel', false],
] as const;

export function PickupBilling({
  initial,
  saveAction,
  version,
  disabled,
  onStatus,
}: PickupBillingProps & {
  version: number | null;
  disabled: boolean;
  onStatus: (ready: boolean, pending: boolean) => void;
}) {
  const [address, setAddress] = useState(() => initial.address ?? normalizeAddress({}));
  const [saved, setSaved] = useState(initial.ready);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initial.error);
  const [choice, setChoice] = useState('');

  // Reconcile readiness when the editor remounts after switching fulfillment.
  useEffect(() => {
    onStatus(saved && !pending, pending);
  }, [saved, pending, onStatus]);

  function edit(next: PickupAddress) {
    setAddress(next);
    setSaved(false);
    onStatus(false, false);
  }

  // Keep reporting readiness even when automatic billing needs no cart UI.
  if (saved) return null;

  return (
    <section
      aria-label="Pickup billing address"
      className="mt-4 rounded border border-contrast-200 p-4"
    >
      <h3 className="font-semibold">Billing address</h3>
      <p className="mt-1 text-sm">
        Choose a saved address or enter the address associated with your payment method.
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || disabled || version === null) return;
          setPending(true);
          setError(undefined);
          onStatus(false, true);

          try {
            const result = await saveAction(address, version);

            if ('error' in result) throw new Error(result.error);
            setAddress(result.address);
            setSaved(true);
            onStatus(true, false);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Unable to save billing address. Please retry.',
            );
            onStatus(false, false);
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset className="space-y-3" disabled={disabled || pending || version === null}>
          <legend className="sr-only">Your billing details</legend>
          {initial.addresses.length > 0 && (
            <label className="block text-sm">
              Saved address
              <select
                className="mt-1 block w-full rounded border border-contrast-300 bg-background p-2"
                onChange={(event) => {
                  const next = initial.addresses.find((a) => String(a.id) === event.target.value);

                  setChoice(event.target.value);
                  edit(next?.address ?? normalizeAddress({ email: address.email }));
                }}
                value={choice}
              >
                <option value="">Enter an address</option>
                {initial.addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.address.address1}, {a.address.city}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fields.map(([key, label, autoComplete, required]) => (
            <label className="block text-sm" key={key}>
              {label}
              <input
                autoComplete={autoComplete}
                className="mt-1 block w-full rounded border border-contrast-300 bg-background p-2"
                maxLength={key === 'phone' || key === 'postalCode' ? 30 : 250}
                name={key}
                onChange={(event) => {
                  edit({
                    ...address,
                    [key]: event.target.value,
                    ...(key === 'stateOrProvince' ? { stateOrProvinceCode: '' } : {}),
                  });
                }}
                required={required}
                type={key === 'phone' ? 'tel' : 'text'}
                value={address[key]}
              />
            </label>
          ))}
          <label className="block text-sm">
            Country
            <select
              autoComplete="billing country"
              className="mt-1 block w-full rounded border border-contrast-300 bg-background p-2"
              name="countryCode"
              onChange={(event) =>
                edit({ ...address, countryCode: event.target.value, stateOrProvinceCode: '' })
              }
              required
              value={address.countryCode}
            >
              <option value="">Select country</option>
              {initial.countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <Button loading={pending} size="small" type="submit" variant="secondary">
            Save billing address
          </Button>
        </fieldset>
      </form>
      <div aria-live="polite" className="mt-2 text-sm">
        {pending && <p>Saving billing address…</p>}
        {Boolean(error) && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
