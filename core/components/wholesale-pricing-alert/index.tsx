import { Alert } from '@/vibes/soul/primitives/alert';
import { Link } from '~/components/link';
import { isWholesalePricingMessageEnabled } from '~/lib/wholesale-pricing';

interface Props {
  isAuthenticated: boolean;
}

export function WholesalePricingAlert({ isAuthenticated }: Props) {
  if (isAuthenticated || !isWholesalePricingMessageEnabled) {
    return null;
  }

  return (
    <Alert
      className="mb-6 w-full !min-w-0 !max-w-none !border-[#19294f] !bg-[#2a4176] [&>div>span]:!text-[#b3d2ff]"
      message={
        <>
          <Link className="font-medium text-[#b3d2ff] underline underline-offset-2" href="/login">
            Login/Create Account
          </Link>{' '}
          to see wholesale pricing.
        </>
      }
      variant="info"
    />
  );
}
