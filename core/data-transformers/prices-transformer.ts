import { ResultOf } from 'gql.tada';
import { getFormatter } from 'next-intl/server';

import { Money, Price } from '@/vibes/soul/primitives/price-label';
import { PricingFragment } from '~/client/fragments/pricing';
import { ExistingResultType } from '~/client/util';

type Pricing = ResultOf<typeof PricingFragment>;
type Format = ExistingResultType<typeof getFormatter>;

export type TaxDisplay = 'INC' | 'EX' | 'BOTH';

export const hasZeroPrice = (pricing: Pricing): boolean =>
  pricing.pricesIncludingTax?.price.value === 0 || pricing.pricesExcludingTax?.price.value === 0;

const toMoney = (
  inc: { value: number; currencyCode: string },
  ex: { value: number; currencyCode: string },
  format: Format,
): Money => ({
  inc: format.number(inc.value, { style: 'currency', currency: inc.currencyCode }),
  ex: format.number(ex.value, { style: 'currency', currency: ex.currencyCode }),
});

export const pricesTransformer = (
  pricing: Pricing,
  format: Format,
  taxDisplay: TaxDisplay | null | undefined = 'EX',
): Price | undefined => {
  const inc = pricing.pricesIncludingTax;
  const ex = pricing.pricesExcludingTax;

  if (!inc || !ex) {
    return undefined;
  }

  let mode: TaxDisplay = taxDisplay ?? 'EX';

  // Tax-disabled stores, tax-exempt customer groups, and some B2B contexts return identical
  // values for inc and ex. Degrade BOTH to a single-price render so we don't duplicate the
  // same number on two lines.
  if (mode === 'BOTH') {
    const hasTaxDifference =
      inc.price.value !== ex.price.value ||
      inc.basePrice?.value !== ex.basePrice?.value ||
      inc.salePrice?.value !== ex.salePrice?.value ||
      inc.priceRange.min.value !== ex.priceRange.min.value ||
      inc.priceRange.max.value !== ex.priceRange.max.value;

    if (!hasTaxDifference) {
      mode = 'EX';
    }
  }

  const isPriceRange = inc.priceRange.min.value !== inc.priceRange.max.value;
  const hasDiscount =
    inc.basePrice != null &&
    ex.basePrice != null &&
    (inc.price.value < inc.basePrice.value || ex.price.value < ex.basePrice.value);

  if (isPriceRange) {
    return {
      type: 'range',
      min: toMoney(inc.priceRange.min, ex.priceRange.min, format),
      max: toMoney(inc.priceRange.max, ex.priceRange.max, format),
      mode,
    };
  }

  if (hasDiscount && inc.basePrice && ex.basePrice) {
    return {
      type: 'sale',
      previous: toMoney(inc.basePrice, ex.basePrice, format),
      current: toMoney(inc.price, ex.price, format),
      mode,
    };
  }

  return {
    type: 'plain',
    money: toMoney(inc.price, ex.price, format),
    mode,
  };
};
