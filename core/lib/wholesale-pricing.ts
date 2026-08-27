import 'server-only';

export const isWholesalePricingMessageEnabled =
  process.env.ENABLE_WHOLESALE_PRICING_MESSAGE === 'true';
