import 'server-only';

const DEFAULT_MINIMUM_ORDER_SUBTOTAL = 2000;

export function getMinimumOrderSubtotal() {
  const configuredValue = process.env.MINIMUM_ORDER_SUBTOTAL;
  const configuredSubtotal = Number(configuredValue);

  return configuredValue != null &&
    configuredValue.trim() !== '' &&
    Number.isFinite(configuredSubtotal) &&
    configuredSubtotal >= 0
    ? configuredSubtotal
    : DEFAULT_MINIMUM_ORDER_SUBTOTAL;
}
