import { clsx } from 'clsx';

import { Alert } from '@/vibes/soul/primitives/alert';
import { Link } from '~/components/link';

interface Props {
  className?: string;
  redirectTo?: string;
}

export function WholesalePricingAlertPresentation({ className, redirectTo }: Props) {
  return (
    <Alert
      className={clsx(
        'w-full !min-w-0 !max-w-none border-2 !border-warning py-4 shadow-md [&>div>span]:text-base [&>div>span]:font-semibold',
        className,
      )}
      message={
        <>
          <Link
            className="font-bold text-foreground underline underline-offset-4"
            href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
          >
            Login/Create Account
          </Link>{' '}
          to see wholesale pricing.
        </>
      }
      variant="warning"
    />
  );
}
