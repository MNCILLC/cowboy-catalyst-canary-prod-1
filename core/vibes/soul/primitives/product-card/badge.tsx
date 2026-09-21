import { Badge } from '@/vibes/soul/primitives/badge';
import { ProUseProductBadge } from '@/vibes/soul/primitives/pro-use';

import type { Product } from './index';

export function ProductCardBadge({
  badge,
  isProUseOnly,
  className,
}: Pick<Product, 'badge' | 'isProUseOnly'> & { className?: string }) {
  if (isProUseOnly) return <ProUseProductBadge className={className} />;

  return badge ? (
    <Badge className={className} shape="rounded">
      {badge}
    </Badge>
  ) : null;
}
