import 'server-only';

export function getFreeShippingAmountRemaining(subtotal: number | undefined) {
  const threshold = Number(process.env.FREE_SHIPPING_THRESHOLD);

  if (
    process.env.SHOW_FREE_SHIPPING_MESSAGE !== 'true' ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    subtotal === undefined ||
    !Number.isFinite(subtotal) ||
    subtotal < 0 ||
    subtotal >= threshold
  ) {
    return undefined;
  }

  return threshold - subtotal;
}
