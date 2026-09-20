import { useTranslations } from 'next-intl';
import {
  Content as CalloutContent,
  Description as CalloutDescription,
  Header as CalloutHeader,
  Root as CalloutRoot,
  Title as CalloutTitle,
} from 'storefront-kit/callout';

import type { Product } from './index';

export function ProductCardPromotions({ promotions }: Pick<Product, 'promotions'>) {
  const t = useTranslations('Components.ProductCard');

  if (!promotions?.length) return null;

  return (
    <div className="mt-1.5">
      <CalloutRoot size="small" variant="warning">
        <CalloutContent>
          <CalloutHeader>
            <CalloutTitle>{promotions[0]?.text ?? ''}</CalloutTitle>
            {promotions.length > 1 && (
              <CalloutDescription>
                {t('moreOffers', { count: promotions.length - 1 })}
              </CalloutDescription>
            )}
          </CalloutHeader>
        </CalloutContent>
      </CalloutRoot>
    </div>
  );
}
