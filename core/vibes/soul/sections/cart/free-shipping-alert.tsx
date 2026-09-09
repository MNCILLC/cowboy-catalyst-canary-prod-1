import { clsx } from 'clsx';
import { Info } from 'lucide-react';

import { Alert } from '@/vibes/soul/primitives/alert';
import { Link } from '~/components/link';

interface Props {
  message: string;
  backgroundClass?: string;
  textClass?: string;
}

export function FreeShippingAlert({
  message,
  backgroundClass = 'bg-yellow-300',
  textClass = 'text-foreground',
}: Props) {
  return (
    <Alert
      className={clsx(
        'mb-6 w-full !min-w-0 !max-w-none [&>div:first-child]:min-w-0 [&>div:first-child]:flex-1',
        // Override the shared info alert background regardless of stylesheet order.
        `[&&]:${backgroundClass}`,
      )}
      message={
        <span className={clsx('flex flex-wrap items-center gap-x-4 gap-y-2', textClass)}>
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
