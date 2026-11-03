import { DEFAULT_PRODUCT_WEIGHT_IN_POUNDS } from './constants';

interface Weight {
  value: number;
  unit: string;
}

const POUNDS_PER_UNIT: Record<string, number> = {
  lb: 1,
  lbs: 1,
  oz: 1 / 16,
  kg: 1 / 0.45359237,
  g: 1 / 453.59237,
  tonne: 1000 / 0.45359237,
};

export function getWeightInPounds(weight: Weight | null | undefined): number | undefined {
  // BigCommerce represents a catalog weight of zero as null in the Storefront API.
  if (!weight || weight.value === 0) {
    return DEFAULT_PRODUCT_WEIGHT_IN_POUNDS;
  }

  if (!Number.isFinite(weight.value) || weight.value < 0) {
    return undefined;
  }

  const multiplier = POUNDS_PER_UNIT[weight.unit.toLowerCase()];

  return multiplier === undefined ? undefined : weight.value * multiplier;
}
