import { clsx } from 'clsx';

import { Badge } from '@/vibes/soul/primitives/badge';

interface Props {
  message?: string | null;
  status?: 'error' | 'success';
  className?: string;
}

export function EnhancedStockLevel({ message, status, className }: Props) {
  if (!message) return null;

  const variant = status ?? 'info';

  return (
    <Badge
      className={clsx(
        'inline-block max-w-full break-words',
        {
          'bg-neutral-300': variant === 'info',
          '!bg-red-700 !text-white': variant === 'error',
          '!bg-green-700 !text-white': variant === 'success',
        },
        className,
      )}
      shape="pill"
      variant={variant}
    >
      {message}
    </Badge>
  );
}
