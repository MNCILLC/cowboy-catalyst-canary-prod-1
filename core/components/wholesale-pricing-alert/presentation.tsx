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
        'w-full !min-w-0 !max-w-none !border-[#19294f] !bg-[#2a4176] [&>div>span]:!text-[#b3d2ff]',
        className,
      )}
      message={
        <>
          <Link
            className="font-medium text-[#b3d2ff] underline underline-offset-2"
            href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
          >
            Login/Create Account
          </Link>{' '}
          to see wholesale pricing.
        </>
      }
      variant="info"
    />
  );
}
