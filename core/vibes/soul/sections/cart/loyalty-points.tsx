'use client';

import { ChevronDown } from 'lucide-react';
import { useActionState, useEffect } from 'react';

import { Button } from '@/vibes/soul/primitives/button';
import { Link } from '~/components/link';
import { useRouter } from '~/i18n/routing';
import type { LoyaltyBalance } from '~/lib/loyalty/server';

interface State {
  success: boolean;
  message: string;
}

interface Props {
  action: (state: State, form: FormData) => Promise<State>;
  balance: LoyaltyBalance;
  signedIn: boolean;
  subtotal: number;
  currency: string;
}

export function LoyaltyPoints({ action, balance, signedIn, subtotal, currency }: Props) {
  const [state, formAction, pending] = useActionState(action, { success: false, message: '' });
  const router = useRouter();
  const { minimum, maximum, centsPerPoint } = balance.rules;
  const money = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: balance.currency }).format(
      amount,
    );
  const max = Math.min(
    balance.available,
    maximum,
    Math.floor(Math.round(subtotal * 100) / centsPerPoint),
  );
  const active = balance.redemption;

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  if (!balance.enabled) return null;

  let controls = (
    <p className="mt-3 text-sm">
      You need at least {minimum.toLocaleString()} available points and{' '}
      {money((minimum * centsPerPoint) / 100)} in eligible merchandise to redeem.
    </p>
  );

  if (max >= minimum) {
    controls = (
      <form action={formAction} className="mt-4 space-y-3">
        <label className="block text-sm" htmlFor="loyalty-points">
          Enter the number of points you want to apply as a discount for this order.
        </label>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="w-full min-w-0 rounded-md border border-[hsl(var(--contrast-300))] bg-white px-3 py-2 text-black"
            defaultValue={minimum}
            disabled={pending}
            id="loyalty-points"
            max={max}
            min={minimum}
            name="points"
            required
            step={1}
            type="number"
          />
          <Button disabled={pending} name="action" size="small" type="submit" value="redeem">
            {pending ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </form>
    );
  }

  if (balance.currency !== currency)
    controls = <p className="mt-3 text-sm">Points can be redeemed in {balance.currency}.</p>;

  if (active) {
    controls = (
      <form action={formAction} className="mt-4 space-y-3">
        <p className="text-sm" role="status">
          {active.points.toLocaleString()} points{' '}
          {active.phase === 'active'
            ? 'applied to this cart'
            : 'reserved while the discount is being updated'}
          .
        </p>
        {active.phase === 'applying' && (
          <>
            <input name="points" type="hidden" value={active.points} />
            <Button disabled={pending} name="action" size="small" type="submit" value="redeem">
              Retry applying points
            </Button>
          </>
        )}
        <Button disabled={pending} name="action" size="small" type="submit" value="remove">
          {pending ? 'Updating…' : 'Remove points'}
        </Button>
      </form>
    );
  }

  return (
    <section
      aria-labelledby="loyalty-title"
      className="my-5 rounded-xl border border-[hsl(var(--contrast-200))] bg-[hsl(var(--contrast-100)/30%)]"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] [&::-webkit-details-marker]:hidden">
          <h3 className="text-lg font-semibold" id="loyalty-title">
            Apply Loyalty Points
          </h3>
          <ChevronDown
            aria-hidden="true"
            className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-[hsl(var(--contrast-200))] p-5">
          {signedIn ? (
            <>
              <p className="text-sm">
                You have <strong>{balance.available.toLocaleString()} points</strong> available
                (worth {money((balance.available * centsPerPoint) / 100)}).
              </p>
              {controls}
            </>
          ) : (
            <p className="text-sm">
              <Link className="underline" href="/login?redirectTo=/cart/">
                Sign in
              </Link>{' '}
              to see and use your points.
            </p>
          )}
          {state.message !== '' && (
            <p className="mt-3 text-sm" role={state.success ? 'status' : 'alert'}>
              {state.message}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
