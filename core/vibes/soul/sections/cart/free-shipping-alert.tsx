import { Info } from 'lucide-react';

import { Alert } from '@/vibes/soul/primitives/alert';
import { Link } from '~/components/link';

export function FreeShippingAlert({ message }: { message: string }) {
  return (
    <Alert
      className="bg-yellow-300 mb-6 w-full !min-w-0 !max-w-none [&>div:first-child]:min-w-0 [&>div:first-child]:flex-1"
      message={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2">
            <Info aria-hidden="true" className="shrink-0" size={20} />
            <span>{message}</span>
          </span>
          <Link
            className="ml-auto shrink-0 font-medium underline underline-offset-4"
            href="/shop-all"
          >
            Continue Shopping
          </Link>
        </span>
      }
      variant="info"
    />
  );
}
